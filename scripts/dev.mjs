#!/usr/bin/env node
/**
 * dev.mjs — UX 优先的开发启动脚本
 *
 * 目标：一条命令启动开发环境，并提供清晰的交互选择与运行反馈。
 *
 * 用法:
 *   node scripts/dev.mjs                 # 交互式选择要启动的服务
 *   node scripts/dev.mjs --yes           # 无交互默认启动 backend + frontend + electron
 *   node scripts/dev.mjs --frontend      # 仅前端
 *   node scripts/dev.mjs --backend       # 仅后端
 *   node scripts/dev.mjs --no-electron   # 前后端，不启 Electron
 *   node scripts/dev.mjs --dry-run       # 仅展示将执行的命令
 */

import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { checkbox } from "@inquirer/prompts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");

const argv = process.argv.slice(2).filter((arg) => arg !== "--");
const hasFlag = (name) => argv.includes(`--${name}`);

const onlyFrontend = hasFlag("frontend");
const onlyBackend = hasFlag("backend");
const noElectron = hasFlag("no-electron");
const yesMode = hasFlag("yes") || argv.includes("-y");
const dryRun = hasFlag("dry-run");
const isCI = process.env.CI === "true";

// ── 工具函数 ──────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
};

function log(msg) {
  console.log(`${c.cyan}[dev]${c.reset} ${msg}`);
}

function spawnProcess(name, cmd, args, opts = {}) {
  const prefixColors = { backend: c.cyan, frontend: c.green, electron: c.magenta, wait: c.yellow };
  const color = prefixColors[name] || c.reset;

  const proc = spawn(cmd, args, {
    cwd: ROOT,
    stdio: ["inherit", "pipe", "pipe"],
    shell: true,
    ...opts,
  });

  proc.stdout?.on("data", (data) => {
    const lines = data.toString().trimEnd().split("\n");
    lines.forEach((line) => line && process.stdout.write(`${color}[${name}]${c.reset} ${line}\n`));
  });

  proc.stderr?.on("data", (data) => {
    const lines = data.toString().trimEnd().split("\n");
    lines.forEach((line) => line && process.stderr.write(`${color}[${name}]${c.reset} ${line}\n`));
  });

  proc.on("error", (err) => {
    console.error(`${color}[${name}]${c.reset} 启动失败: ${err.message}`);
  });

  return proc;
}

function waitForUrl(url) {
  return new Promise((resolve, reject) => {
    const waiter = spawnProcess("wait", "npx", ["wait-on", url]);
    waiter.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`等待 ${url} 超时或失败`));
      }
    });
  });
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
const children = [];
let shuttingDown = false;

function cleanup(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  log("正在关闭所有子进程...");
  for (const p of children) {
    try { p.kill("SIGTERM"); } catch {}
  }
  setTimeout(() => process.exit(exitCode), 120);
}

function trackProcess(name, proc) {
  children.push(proc);
  proc.on("close", (code) => {
    if (shuttingDown) return;
    if (code && code !== 0) {
      console.error(`${c.red}[${name}] 进程异常退出 (code=${code})${c.reset}`);
      cleanup(code);
    }
  });
}

async function resolveServices() {
  if (onlyFrontend && onlyBackend) return ["frontend", "backend"];
  if (onlyFrontend) return ["frontend"];
  if (onlyBackend) return ["backend"];
  if (yesMode || isCI) {
    const defaults = ["backend", "frontend"];
    if (!noElectron) defaults.push("electron");
    return defaults;
  }

  const selected = await checkbox({
    message: "选择要启动的开发服务（可多选）",
    required: true,
    choices: [
      { name: "Backend (FastAPI)", value: "backend", checked: true },
      { name: "Frontend (Next.js)", value: "frontend", checked: true },
      { name: "Electron Desktop", value: "electron", checked: !noElectron },
    ],
  });

  return selected;
}

async function main() {
  process.on("SIGINT", () => cleanup(0));
  process.on("SIGTERM", () => cleanup(0));

  log("🚀 AgentNews 开发环境启动器");
  const services = await resolveServices();
  if (services.length === 0) {
    console.error(`${c.red}未选择任何服务，已退出。${c.reset}`);
    process.exit(1);
  }

  if (services.includes("electron") && !services.includes("frontend")) {
    log("Electron 依赖前端服务，已自动补充 Frontend。`\n`");
    services.push("frontend");
  }

  const normalized = [...new Set(services)].filter((s) => !(noElectron && s === "electron"));
  log(`已选服务: ${normalized.join(", ")}`);

  const python = getPythonCmd();
  const plan = {
    backend: [python, ["-m", "backend.main"]],
    frontend: ["pnpm", ["--prefix", "frontend", "dev"]],
    electron: ["npx", ["electron", "."]],
  };

  if (dryRun) {
    log("[dry-run] 将执行以下命令:");
    for (const svc of normalized) {
      const [cmd, args] = plan[svc];
      console.log(`  - ${svc}: ${cmd} ${args.join(" ")}`);
    }
    process.exit(0);
  }

  if (normalized.includes("backend")) {
    log(`后端启动: ${plan.backend[0]} ${plan.backend[1].join(" ")}`);
    trackProcess("backend", spawnProcess("backend", plan.backend[0], plan.backend[1]));
  }

  if (normalized.includes("frontend")) {
    log(`前端启动: ${plan.frontend[0]} ${plan.frontend[1].join(" ")}`);
    trackProcess("frontend", spawnProcess("frontend", plan.frontend[0], plan.frontend[1]));
  }

  if (normalized.includes("electron")) {
    log("等待 Frontend 就绪后启动 Electron (http://localhost:3000)...");
    try {
      await waitForUrl("http://localhost:3000");
      log(`Electron 启动: ${plan.electron[0]} ${plan.electron[1].join(" ")}`);
      trackProcess("electron", spawnProcess("electron", plan.electron[0], plan.electron[1]));
    } catch (err) {
      console.error(`${c.red}${err.message}${c.reset}`);
      cleanup(1);
      return;
    }
  }

  log("服务已启动，按 Ctrl+C 结束。\n");
}

main().catch((err) => {
  console.error(`${c.red}${err.message}${c.reset}`);
  cleanup(1);
});
