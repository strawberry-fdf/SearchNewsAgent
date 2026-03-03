/**
 * Electron 主进程 —— 管理应用窗口与 Python 后端子进程的生命周期。
 *
 * 职责:
 * 1. 启动内嵌的 Python 后端（生产模式）或连接外部开发服务器
 * 2. 创建 BrowserWindow 加载前端界面
 * 3. 优雅关闭后端子进程与应用窗口
 *
 * 生产模式: Electron → 启动 PyInstaller 打包的后端 → 后端同时提供 API + 静态前端
 * 开发模式: Electron → 连接 localhost:3000 (Next.js dev) + localhost:8000 (FastAPI dev)
 */

const { app, BrowserWindow, Menu, dialog, shell, ipcMain, net, Tray, nativeImage } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");
const https = require("https");
const fs = require("fs");
const { autoUpdater } = require("electron-updater");

// ─── 常量 ────────────────────────────────────────────────────
const isDev = !app.isPackaged;
const BACKEND_PORT = 8000;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
const HEALTH_CHECK_URL = `${BACKEND_URL}/api/stats`;
const BACKEND_STARTUP_TIMEOUT = 60_000; // 60 秒超时

let backendProcess = null;
let mainWindow = null;
let tray = null;
let isQuitting = false;

// ─── 日志辅助 ────────────────────────────────────────────────
function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [Electron] ${msg}`);
}

// ─── 路径工具 ────────────────────────────────────────────────

/**
 * 获取 PyInstaller 打包后的后端可执行文件路径（仅生产模式）。
 */
function getBackendExePath() {
  if (isDev) return null;
  const ext = process.platform === "win32" ? ".exe" : "";
  return path.join(process.resourcesPath, "backend", `backend${ext}`);
}

/**
 * 获取 Next.js 静态导出的前端文件目录（仅生产模式）。
 */
function getFrontendStaticDir() {
  return path.join(process.resourcesPath, "frontend");
}

/**
 * 获取用户数据目录（存放 SQLite DB、.env 等可写文件）。
 */
function getUserDataDir() {
  return app.getPath("userData");
}

// ─── 后端管理 ────────────────────────────────────────────────

/**
 * 启动 Python 后端子进程（仅生产模式）。
 * 后端通过环境变量获取静态文件目录和端口号。
 */
function startBackend() {
  const exePath = getBackendExePath();
  if (!exePath) return;

  if (!fs.existsSync(exePath)) {
    log(`错误: 找不到后端可执行文件: ${exePath}`);
    dialog.showErrorBox(
      "启动失败",
      `找不到后端程序:\n${exePath}\n请重新安装应用。`
    );
    app.quit();
    return;
  }

  const userDataDir = getUserDataDir();
  const frontendDir = getFrontendStaticDir();
  const dbPath = path.join(userDataDir, "agent_news.db");

  // 如果用户数据目录下没有 .env 文件，复制默认模板
  const userEnvPath = path.join(userDataDir, ".env");
  const defaultEnvPath = path.join(process.resourcesPath, "default.env");
  if (!fs.existsSync(userEnvPath) && fs.existsSync(defaultEnvPath)) {
    fs.copyFileSync(defaultEnvPath, userEnvPath);
    log(`已复制默认 .env 到: ${userEnvPath}`);
  }

  log(`启动后端: ${exePath}`);
  log(`  静态目录: ${frontendDir}`);
  log(`  数据库: ${dbPath}`);
  log(`  端口: ${BACKEND_PORT}`);

  backendProcess = spawn(exePath, [], {
    env: {
      ...process.env,
      STATIC_DIR: frontendDir,
      SQLITE_DB_PATH: dbPath,
      PORT: String(BACKEND_PORT),
      ELECTRON_MODE: "1",
      // 加载用户自定义 .env
      ENV_FILE_PATH: userEnvPath,
    },
    stdio: ["pipe", "pipe", "pipe"],
    // Windows 下使用 detached=false 确保子进程跟随父进程退出
    detached: false,
    // 隐藏后端控制台窗口，实现无感启动
    windowsHide: true,
  });

  backendProcess.stdout.on("data", (data) => {
    log(`[Backend stdout] ${data.toString().trim()}`);
  });

  backendProcess.stderr.on("data", (data) => {
    log(`[Backend stderr] ${data.toString().trim()}`);
  });

  backendProcess.on("error", (err) => {
    log(`后端进程启动失败: ${err.message}`);
  });

  backendProcess.on("close", (code) => {
    log(`后端进程退出, code=${code}`);
    backendProcess = null;
  });
}

/**
 * 停止后端子进程。
 */
function stopBackend() {
  if (!backendProcess) return;
  log("正在停止后端进程...");
  try {
    if (process.platform === "win32") {
      // Windows: 使用 taskkill 终止进程树
      spawn("taskkill", ["/pid", String(backendProcess.pid), "/f", "/t"]);
    } else {
      backendProcess.kill("SIGTERM");
    }
  } catch (err) {
    log(`停止后端出错: ${err.message}`);
  }
  backendProcess = null;
}

/**
 * 轮询后端健康检查端点，等待后端就绪。
 */
function waitForBackend(timeoutMs = BACKEND_STARTUP_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const poll = () => {
      const req = http.get(HEALTH_CHECK_URL, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          scheduleRetry();
        }
        res.resume(); // 消费响应数据
      });
      req.on("error", () => scheduleRetry());
      req.setTimeout(2000, () => {
        req.destroy();
        scheduleRetry();
      });
    };

    const scheduleRetry = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`后端在 ${timeoutMs / 1000} 秒内未就绪`));
      } else {
        setTimeout(poll, 500);
      }
    };

    poll();
  });
}

// ─── 窗口管理 ────────────────────────────────────────────────

/**
 * 创建应用主窗口。
 */
function createMainWindow() {
  // Windows/Linux 需要显式设置窗口图标（macOS 使用 app bundle 中的 icns）
  const windowIconPath = getIconPath("icon.png");

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "AgentNews - AI 智能资讯精选",
    show: false, // 先隐藏，加载完成后显示
    backgroundColor: "#1a1a2e",
    icon: fs.existsSync(windowIconPath) ? windowIconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // 窗口准备就绪后显示，避免白屏闪烁
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // 外部链接用系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // 拦截窗口关闭事件：弹出对话框让用户选择最小化到托盘还是完全退出
  mainWindow.on("close", (e) => {
    if (isQuitting) return; // 真正退出时不拦截
    e.preventDefault();
    dialog
      .showMessageBox(mainWindow, {
        type: "question",
        title: "关闭窗口",
        message: "您希望如何处理？",
        detail: "最小化到托盘后，应用将在后台继续运行。",
        buttons: ["最小化到托盘", "完全退出", "取消"],
        defaultId: 0,
        cancelId: 2,
      })
      .then(({ response }) => {
        if (response === 0) {
          // 最小化到托盘
          mainWindow.hide();
        } else if (response === 1) {
          // 完全退出
          isQuitting = true;
          app.quit();
        }
        // response === 2: 取消，什么也不做
      });
  });

  return mainWindow;
}

/**
 * 获取图标文件路径的辅助函数。
 * 开发模式: build/ 目录
 * 生产模式: process.resourcesPath 目录
 */
function getIconPath(filename) {
  if (isDev) {
    return path.join(__dirname, "..", "build", filename);
  }
  return path.join(process.resourcesPath, filename);
}

/**
 * 创建系统托盘图标及右键菜单。
 */
function createTray() {
  let trayImage;

  if (process.platform === "darwin") {
    // macOS: 优先使用 Template 图标（系统自动适配亮色/暗色菜单栏）
    const templatePath = getIconPath("tray-iconTemplate.png");
    const template2xPath = getIconPath("tray-iconTemplate@2x.png");
    if (fs.existsSync(templatePath)) {
      trayImage = nativeImage.createFromPath(templatePath);
      trayImage.setTemplateImage(true);
    } else {
      // 回退到通用 tray-icon.png
      const fallback = getIconPath("tray-icon.png");
      if (fs.existsSync(fallback)) {
        trayImage = nativeImage.createFromPath(fallback);
        trayImage = trayImage.resize({ width: 16, height: 16 });
      }
    }
  } else {
    // Windows / Linux: 使用 tray-icon.png，回退到 icon.png
    const candidates = ["tray-icon.png", "icon.png"];
    for (const name of candidates) {
      const p = getIconPath(name);
      if (fs.existsSync(p)) {
        trayImage = nativeImage.createFromPath(p);
        break;
      }
    }
  }

  // 最终兜底：生成空白图标
  if (!trayImage || trayImage.isEmpty()) {
    trayImage = nativeImage.createEmpty();
  }

  tray = new Tray(trayImage);
  tray.setToolTip("AgentNews - AI 智能资讯精选");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "显示主窗口",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: "separator" },
    {
      label: "完全退出",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // 单击托盘图标：显示/隐藏主窗口
  tray.on("click", () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

/**
 * 构建应用菜单栏。
 */
function buildAppMenu() {
  const template = [
    {
      label: "文件",
      submenu: [
        {
          label: "打开配置目录",
          click: () => {
            shell.openPath(getUserDataDir());
          },
        },
        { type: "separator" },
        { label: "退出", role: "quit" },
      ],
    },
    {
      label: "视图",
      submenu: [
        { label: "重新加载", role: "reload" },
        { label: "强制重新加载", role: "forceReload" },
        { type: "separator" },
        { label: "放大", role: "zoomIn" },
        { label: "缩小", role: "zoomOut" },
        { label: "重置缩放", role: "resetZoom" },
        { type: "separator" },
        { label: "全屏", role: "togglefullscreen" },
        ...(isDev
          ? [{ type: "separator" }, { label: "开发者工具", role: "toggleDevTools" }]
          : []),
      ],
    },
    {
      label: "帮助",
      submenu: [
        {
          label: "GitHub 仓库",
          click: () => {
            shell.openExternal(
              "https://github.com/strawberry-fdf/SearchNewsAgent"
            );
          },
        },
        {
          label: "检查更新...",
          click: () => {
            checkGitHubRelease(true);
          },
        },
        { type: "separator" },
        {
          label: "关于",
          click: () => {
            dialog.showMessageBox(mainWindow, {
              title: "关于 AgentNews",
              message: "AgentNews - AI 智能资讯精选系统",
              detail: `版本: ${app.getVersion()}\nElectron: ${process.versions.electron}\nNode: ${process.versions.node}\n平台: ${process.platform} ${process.arch}`,
            });
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── 应用生命周期 ────────────────────────────────────────────

app.whenReady().then(async () => {
  buildAppMenu();
  createTray();
  const win = createMainWindow();

  if (isDev) {
    // ── 开发模式 ──────────────────────────────────────
    // 需要手动启动后端 (python -m backend.main) 和前端 (cd frontend && npm run dev)
    log("开发模式: 加载 http://localhost:3000");
    win.loadURL("http://localhost:3000");
    win.webContents.openDevTools({ mode: "detach" });
    setupAutoUpdater();
  } else {
    // ── 生产模式 ──────────────────────────────────────
    // 无感启动：窗口保持隐藏，后台静默启动后端，就绪后直接显示主界面
    startBackend();

    try {
      await waitForBackend();
      log("后端已就绪，加载主界面");
      win.loadURL(BACKEND_URL);
      // 后端就绪后启动自动更新检查
      setupAutoUpdater();
    } catch (err) {
      log(`后端启动失败: ${err.message}`);
      dialog.showErrorBox(
        "启动失败",
        `后端服务未能在规定时间内启动。\n\n${err.message}\n\n请检查配置文件或重新安装。`
      );
      app.quit();
    }
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  // 当所有窗口关闭时，不自动退出，因为可能最小化到了托盘
  // 仅在 isQuitting 为 true 时才真正退出
  if (isQuitting) {
    stopBackend();
    if (process.platform !== "darwin") {
      app.quit();
    }
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  stopBackend();
});

// 防止应用多开
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// ─── 自动更新 ────────────────────────────────────────────────
// Windows/Linux: electron-updater 静默下载并提示安装
// macOS（未签名）: 对比 GitHub Release tag，弹窗引导手动下载

// ─── 更新检查配置 ────────────────────────────────────────────
const UPDATE_CHECK_DELAY = 5_000;         // 启动后首次检查延迟 (5 秒)
// const UPDATE_CHECK_INTERVAL = 4 * 3600_000; // 定期检查间隔 (4 小时)
const UPDATE_CHECK_INTERVAL = 60_000; // 定期检查间隔 (1 分钟，测试用)
const UPDATE_REQUEST_TIMEOUT = 15_000;    // 单次请求超时 (15 秒)
const UPDATE_MAX_RETRIES = 2;             // 最大重试次数
const UPDATE_RETRY_DELAY = 5_000;         // 重试间隔 (5 秒)
const GITHUB_API_URL = "https://api.github.com/repos/strawberry-fdf/SearchNewsAgent/releases/latest";

/**
 * 初始化自动更新（仅生产模式）。
 * 在主窗口加载完成后调用。
 *
 * 当前策略: 所有平台统一通过 GitHub Releases API 检查最新版本，
 * 通过 IPC 通知前端用左下角 Toast 展示结果。
 *
 * 网络健壮性:
 * - 使用 Electron net 模块（走 Chromium 网络栈，自动遵循系统代理）
 * - 失败自动重试（最多 2 次，间隔 5 秒）
 * - 启动后 5 秒首次检查，之后按 UPDATE_CHECK_INTERVAL 定期检查
 * - 自动检查失败静默跳过，手动检查失败显示提示
 */
function setupAutoUpdater() {
  // 延迟首次检查，避免影响启动速度
  setTimeout(() => checkGitHubRelease(false), UPDATE_CHECK_DELAY);

  // 定期检查（当前 1 分钟，测试用）
  setInterval(() => checkGitHubRelease(false), UPDATE_CHECK_INTERVAL);

  // TODO: 接入 CI/CD 后，Windows/Linux 可启用 electron-updater:
  // if (process.platform !== "darwin") {
  //   setupElectronUpdater();
  // }
}

/**
 * 使用 electron-updater 实现 Windows/Linux 自动更新。
 */
function setupElectronUpdater() {
  // 不自动下载，先通知用户
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    log("正在检查更新...");
  });

  autoUpdater.on("update-available", (info) => {
    log(`发现新版本: v${info.version}`);
    dialog
      .showMessageBox(mainWindow, {
        type: "info",
        title: "发现新版本",
        message: `新版本 v${info.version} 已发布`,
        detail: `当前版本: v${app.getVersion()}\n\n是否立即下载更新？`,
        buttons: ["立即下载", "稍后提醒"],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) {
          autoUpdater.downloadUpdate();
          // 通知渲染进程开始下载
          if (mainWindow) {
            mainWindow.webContents.send("update-downloading", {
              version: info.version,
            });
          }
        }
      });
  });

  autoUpdater.on("update-not-available", () => {
    log("当前已是最新版本");
  });

  autoUpdater.on("download-progress", (progress) => {
    log(`下载进度: ${progress.percent.toFixed(1)}%`);
    if (mainWindow) {
      mainWindow.webContents.send("update-progress", {
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
      });
    }
  });

  autoUpdater.on("update-downloaded", (info) => {
    log(`更新已下载: v${info.version}，准备安装`);
    dialog
      .showMessageBox(mainWindow, {
        type: "info",
        title: "更新就绪",
        message: "更新已下载完成",
        detail: `新版本 v${info.version} 已准备就绪，重启应用即可完成更新。`,
        buttons: ["立即重启", "稍后重启"],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
  });

  autoUpdater.on("error", (err) => {
    log(`自动更新出错: ${err.message}`);
  });

  // 延迟 5 秒后首次检查，避免影响启动速度
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      log(`检查更新失败: ${err.message}`);
    });
  }, 5000);
}

/**
 * 通过 GitHub Releases API 检查最新版本（全平台通用）。
 *
 * 健壮性设计:
 * - 使用 Electron `net` 模块发起请求，自动遵循系统代理设置
 *   （解决中国大陆用户通过 VPN/代理访问 GitHub 的问题）
 * - 请求超时 15 秒，失败自动重试最多 2 次（间隔 5 秒）
 * - 自动检查失败静默跳过；手动检查失败向前端发送错误提示
 *
 * @param {boolean} manual - 是否为用户手动触发（true 时无论结果都显示反馈）
 * @param {number} retryCount - 当前重试次数（内部使用，外部调用无需传入）
 */
function checkGitHubRelease(manual = false, retryCount = 0) {
  const currentVersion = app.getVersion();

  /** 向渲染进程发送更新检查结果 */
  const sendResult = (payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-check-result", {
        ...payload,
        currentVersion,
        manual,
      });
    }
  };

  /** 处理可重试的失败 */
  const handleRetryableError = (errorMsg) => {
    if (retryCount < UPDATE_MAX_RETRIES) {
      log(`更新检查失败 (第 ${retryCount + 1} 次)，${UPDATE_RETRY_DELAY / 1000} 秒后重试: ${errorMsg}`);
      setTimeout(() => checkGitHubRelease(manual, retryCount + 1), UPDATE_RETRY_DELAY);
    } else {
      log(`更新检查最终失败 (已重试 ${UPDATE_MAX_RETRIES} 次): ${errorMsg}`);
      if (manual) {
        sendResult({ type: "error", message: `网络连接失败，请检查网络后重试` });
      }
    }
  };

  try {
    // 使用 Electron net 模块：走 Chromium 网络栈，自动遵循系统代理
    const req = net.request({
      url: GITHUB_API_URL,
      method: "GET",
    });

    req.setHeader("User-Agent", `AgentNews/${currentVersion}`);
    req.setHeader("Accept", "application/vnd.github.v3+json");

    // 超时处理
    const timeoutId = setTimeout(() => {
      req.abort();
      log(`检查更新请求超时 (${UPDATE_REQUEST_TIMEOUT / 1000}s)`);
      handleRetryableError("请求超时");
    }, UPDATE_REQUEST_TIMEOUT);

    req.on("response", (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk.toString()));
      res.on("end", () => {
        clearTimeout(timeoutId);
        try {
          if (res.statusCode === 404) {
            // 仓库尚无 Release，属于正常状态
            log("尚无 GitHub Release，跳过更新检查");
            if (manual) {
              sendResult({ type: "up-to-date" });
            }
            return;
          }
          if (res.statusCode === 403) {
            // GitHub API 限流 (60 次/小时 无认证)
            log("GitHub API 限流 (403)，稍后重试");
            handleRetryableError("API 请求频率超限");
            return;
          }
          if (res.statusCode !== 200) {
            log(`GitHub API 返回 ${res.statusCode}，跳过更新检查`);
            if (manual) {
              sendResult({ type: "error", message: `服务器返回 ${res.statusCode}，请稍后重试` });
            }
            return;
          }

          const release = JSON.parse(data);
          const latestTag = release.tag_name || "";
          const latestVersion = latestTag.replace(/^v/, "");

          if (isNewerVersion(latestVersion, currentVersion)) {
            log(`发现新版本 v${latestVersion} (当前 v${currentVersion})`);
            sendResult({
              type: "update-available",
              version: latestVersion,
              downloadUrl: release.html_url,
            });
          } else {
            log(`当前已是最新版本 (v${currentVersion})`);
            if (manual) {
              sendResult({ type: "up-to-date" });
            }
          }
        } catch (err) {
          log(`解析 GitHub Release 响应失败: ${err.message}`);
          if (manual) {
            sendResult({ type: "error", message: "解析服务器响应失败" });
          }
        }
      });

      res.on("error", (err) => {
        clearTimeout(timeoutId);
        handleRetryableError(err.message);
      });
    });

    req.on("error", (err) => {
      clearTimeout(timeoutId);
      handleRetryableError(err.message);
    });

    req.end();
  } catch (err) {
    // net 模块在极端情况下可能抛出同步异常
    log(`更新检查异常: ${err.message}`);
    if (manual) {
      sendResult({ type: "error", message: "检查更新时发生错误" });
    }
  }
}

/**
 * 比较语义化版本号，判断 latest 是否比 current 更新。
 * @param {string} latest - 最新版本号 (如 "1.2.3")
 * @param {string} current - 当前版本号 (如 "1.0.0")
 * @returns {boolean}
 */
function isNewerVersion(latest, current) {
  if (!latest || !current) return false;
  const l = latest.split(".").map(Number);
  const c = current.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const lv = l[i] || 0;
    const cv = c[i] || 0;
    if (lv > cv) return true;
    if (lv < cv) return false;
  }
  return false;
}

// ─── IPC: 渲染进程手动触发更新检查 ──────────────────────────
ipcMain.handle("check-for-updates", async () => {
  checkGitHubRelease(true);
  return { status: "checking" };
});

// ─── IPC: 渲染进程请求打开外部链接 ─────────────────────────
ipcMain.handle("open-external", async (_event, url) => {
  if (url && typeof url === "string" && url.startsWith("https://")) {
    shell.openExternal(url);
  }
});

// ─── IPC: 开机自启动管理 ──────────────────────────────────────
ipcMain.handle("get-auto-launch", async () => {
  const settings = app.getLoginItemSettings();
  return { enabled: settings.openAtLogin };
});

ipcMain.handle("set-auto-launch", async (_event, enabled) => {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    // macOS: 使用 AppleScript 方式注册（适用于未签名应用）
    // Windows/Linux: 自动注册到启动目录/注册表
  });
  const updated = app.getLoginItemSettings();
  return { enabled: updated.openAtLogin };
});
