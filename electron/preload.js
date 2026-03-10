/**
 * Electron Preload 脚本 —— 在渲染进程加载前执行。
 *
 * 通过 contextBridge 安全地向渲染进程暴露有限的 API，
 * 保持 contextIsolation 开启以确保安全性。
 */

const { contextBridge, ipcRenderer } = require("electron");

function getAppVersion() {
  try {
    return ipcRenderer.sendSync("get-app-version-sync");
  } catch {
    return "0.0.0";
  }
}

// 向渲染进程暴露最小化的桌面 API
contextBridge.exposeInMainWorld("electronAPI", {
  /** 当前是否运行在 Electron 环境中 */
  isElectron: true,

  /** 获取当前平台: win32 | linux | darwin */
  platform: process.platform,

  /** 获取应用版本 */
  version: getAppVersion(),

  // ── 自动更新 API ──────────────────────────────────────
  /** 手动触发更新检查 */
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),

  /** 启动应用内更新下载并安装（Win/Linux） */
  startUpdateInstallation: () => ipcRenderer.invoke("start-update-installation"),

  /** 获取更新后首次启动需要展示的发布说明 */
  getPostUpdateReleaseNotes: () => ipcRenderer.invoke("get-post-update-release-notes"),

  /** 关闭更新后说明弹窗并清除待展示状态 */
  dismissPostUpdateReleaseNotes: () => ipcRenderer.invoke("dismiss-post-update-release-notes"),

  /** 前端 mount 后主动查询是否有待处理的更新通知（弥补启动时序差） */
  getPendingUpdateStatus: () => ipcRenderer.invoke("get-pending-update-status"),

  /** 监听更新检查结果（前端 Toast 展示），返回清理函数 */
  onUpdateCheckResult: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("update-check-result", handler);
    return () => ipcRenderer.removeListener("update-check-result", handler);
  },

  /** 打开外部链接（由主进程安全执行） */
  openExternal: (url) => ipcRenderer.invoke("open-external", url),

  // ── 开机自启动 API ────────────────────────────────────
  /** 获取当前开机自启动状态 */
  getAutoLaunch: () => ipcRenderer.invoke("get-auto-launch"),

  /** 设置开机自启动 */
  setAutoLaunch: (enabled) => ipcRenderer.invoke("set-auto-launch", enabled),

  /** 监听更新下载进度，返回清理函数 */
  onUpdateProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("update-progress", handler);
    return () => ipcRenderer.removeListener("update-progress", handler);
  },

  /** 监听更新开始下载，返回清理函数 */
  onUpdateDownloading: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("update-downloading", handler);
    return () => ipcRenderer.removeListener("update-downloading", handler);
  },
});
