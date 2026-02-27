/**
 * Electron Preload 脚本 —— 在渲染进程加载前执行。
 *
 * 通过 contextBridge 安全地向渲染进程暴露有限的 API，
 * 保持 contextIsolation 开启以确保安全性。
 */

const { contextBridge } = require("electron");

// 向渲染进程暴露最小化的桌面 API
contextBridge.exposeInMainWorld("electronAPI", {
  /** 当前是否运行在 Electron 环境中 */
  isElectron: true,

  /** 获取当前平台: win32 | linux | darwin */
  platform: process.platform,

  /** 获取应用版本 */
  version: process.env.npm_package_version || "0.0.0",
});
