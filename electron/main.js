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

const { app, BrowserWindow, Menu, dialog, shell } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");

// ─── 常量 ────────────────────────────────────────────────────
const isDev = !app.isPackaged;
const BACKEND_PORT = 8000;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
const HEALTH_CHECK_URL = `${BACKEND_URL}/api/stats`;
const BACKEND_STARTUP_TIMEOUT = 60_000; // 60 秒超时

let backendProcess = null;
let mainWindow = null;

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
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "AgentNews - AI 智能资讯精选",
    show: false, // 先隐藏，加载完成后显示
    backgroundColor: "#1a1a2e",
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

  return mainWindow;
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
  const win = createMainWindow();

  if (isDev) {
    // ── 开发模式 ──────────────────────────────────────
    // 需要手动启动后端 (python -m backend.main) 和前端 (cd frontend && npm run dev)
    log("开发模式: 加载 http://localhost:3000");
    win.loadURL("http://localhost:3000");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    // ── 生产模式 ──────────────────────────────────────
    // 无感启动：窗口保持隐藏，后台静默启动后端，就绪后直接显示主界面
    startBackend();

    try {
      await waitForBackend();
      log("后端已就绪，加载主界面");
      win.loadURL(BACKEND_URL);
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
  stopBackend();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
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
