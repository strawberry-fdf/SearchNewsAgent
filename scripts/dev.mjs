#!/usr/bin/env node
/**
 * dev.mjs — 开发启动脚本
 *
 * 一键启动前端 + 后端 + Electron 开发环境，也支持单独启动某一端。
 *
 * 用法:
 *   node scripts/dev.mjs              # 启动全部（后端 + 前端 + Electron）
 *   node scripts/dev.mjs --frontend   # 仅启动前端 (Next.js dev)
 *   node scripts/dev.mjs --backend    # 仅启动后端 (Python FastAPI)
 *   node scripts/dev.mjs --no-electron # 启动前后端，不启动 Electron
 */

import { execSync, spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");

const args = process.argv.slice(2);
const onlyFrontend = args.includes("--frontend");
const onlyBackend = args.includes("--backend");
const noElectron = args.includes("--no-electron");

// ── 工具函数 ──────────────────────────────────────────────────
function log(label, msg) {
  const colors = { info: "\x1b[36m", ok: "\x1b[32m", warn: "\x1b[33m", reset: "\x1b[0m" };
  console.log(`${colors.info}[dev]${colors.reset} ${msg}`);
}

function spawnProcess(name, cmd, args, opts = {}) {
  const prefixColors = { backend: "\x1b[36m", frontend: "\x1b[32m", electron: "\x1b[35m" };
  const color = prefixColors[name] || "\x1b[37m";
  const reset = "\x1b[0m";

  const proc = spawn(cmd, args, {
    cwd: ROOT,
    stdio: ["inherit", "pipe", "pipe"],
    shell: true,
    ...opts,
  });

  proc.stdout?.on("data", (data) => {
    const lines = data.toString().trimEnd().split("\n");
    lines.forEach((line) => process.stdout.write(`${color}[${name}]${reset} ${line}\n`));
  });

  proc.stderr?.on("data", (data) => {
    const lines = data.toString().trimEnd().split("\n");
    lines.forEach((line) => process.stderr.write(`${color}[${name}]${reset} ${line}\n`));
  });

  proc.on("error", (err) => {
    console.error(`${color}[${name}]${reset} 启动失败: ${err.message}`);
  });

  return proc;
}

// ── 检测 Python 虚拟环境 ──────────────────────────────────────
function getPythonCmd() {
  const venvPaths = [
    resolve(ROOT, "venv/bin/python"),
    resolve(ROOT, "backend/venv/bin/python"),
    resolve(ROOT, ".venv/bin/python"),
  ];
  for (const p of venvPaths) {
    if (existsSync(p)) return p;
  }
  return "python";
}

// ── 主逻辑 ───────────────────────────────────────────────────
const procs = [];

function cleanup() {
  log("info", "正在关闭所有进程...");
  procs.forEach((p) => {
    try { p.kill("SIGTERM"); } catch {}
  });
  process.exit(0);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

log("info", "🚀 AgentNews 开发环境启动中...\n");

// 后端
if (!onlyFrontend) {
  const python = getPythonCmd();
  log("info", `后端: ${python} -m backend.main`);
  procs.push(spawnProcess("backend", python, ["-m", "backend.main"]));
}

// 前端
if (!onlyBackend) {
  log("info", "前端: pnpm --prefix frontend dev");
  procs.push(spawnProcess("frontend", "pnpm", ["--prefix", "frontend", "dev"]));
}

// Electron
if (!onlyFrontend && !onlyBackend && !noElectron) {
  // 等待前端就绪后再启动 Electron
  log("info", "Electron: 等待 http://localhost:3000 就绪...");
  setTimeout(() => {
    procs.push(spawnProcess("electron", "npx", ["wait-on", "http://localhost:3000", "&&", "npx", "electron", "."]));
  }, 2000);
}

log("info", "按 Ctrl+C 终止所有进程\n");
