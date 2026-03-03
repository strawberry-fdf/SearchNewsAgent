#!/usr/bin/env node
/**
 * check.mjs — UX 优先的代码检查脚本
 *
 * 目标：一条命令按需选择检查任务，并给出清晰可读的结果汇总。
 *
 * 用法:
 *   node scripts/check.mjs               # 交互式选择检查项
 *   node scripts/check.mjs --yes         # 无交互执行全部检查
 *   node scripts/check.mjs --frontend    # 前端检查（TypeScript + Vitest）
 *   node scripts/check.mjs --backend     # 后端检查（Pytest）
 *   node scripts/check.mjs --typecheck   # 仅 TypeScript
 *   node scripts/check.mjs --test        # 前后端测试
 */

import { execSync } from "node:child_process";
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
const onlyTypeCheck = hasFlag("typecheck");
const onlyTest = hasFlag("test");
const yesMode = hasFlag("yes") || argv.includes("-y");
const isCI = process.env.CI === "true";
const runAllByDefault = yesMode || isCI;

const c = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  cyan: "\x1b[36m", green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m",
};

const TASKS = {
  typecheck: {
    label: "前端 TypeScript 类型检查",
    cmd: "npx tsc --noEmit",
    cwd: resolve(ROOT, "frontend"),
  },
  frontendTest: {
    label: "前端单元测试 (Vitest)",
    cmd: "npx vitest run --reporter=dot",
    cwd: resolve(ROOT, "frontend"),
  },
  backendTest: {
    label: "后端单元测试 (Pytest)",
    cmd: "__PYTHON__ -m pytest backend/tests/ -q --tb=short",
    cwd: ROOT,
  },
};

let passed = 0;
let failed = 0;
const failures = [];

function runStep(label, cmd, cwd = ROOT) {
  console.log(`\n${c.cyan}━━━ ${label} ━━━${c.reset}`);
  try {
    execSync(cmd, { cwd, stdio: "inherit", encoding: "utf-8" });
    passed++;
    console.log(`${c.green}✅ ${label} — 通过${c.reset}`);
  } catch {
    failed++;
    failures.push(label);
    console.log(`${c.red}❌ ${label} — 失败${c.reset}`);
  }
}

// ── 检测 Python 虚拟环境 ──────────────────────────────────────
function getPythonCmd() {
  const paths = ["venv/bin/python", "backend/venv/bin/python", ".venv/bin/python"];
  for (const p of paths) {
    if (existsSync(resolve(ROOT, p))) return resolve(ROOT, p);
  }
  return "python";
}

async function resolveSelectedTasks() {
  if (onlyTypeCheck) return ["typecheck"];
  if (onlyFrontend) return ["typecheck", "frontendTest"];
  if (onlyBackend) return ["backendTest"];
  if (onlyTest) return ["frontendTest", "backendTest"];
  if (runAllByDefault) return ["typecheck", "frontendTest", "backendTest"];

  const selected = await checkbox({
    message: "选择要执行的检查项（可多选）",
    required: true,
    choices: [
      { name: TASKS.typecheck.label, value: "typecheck", checked: true },
      { name: TASKS.frontendTest.label, value: "frontendTest", checked: true },
      { name: TASKS.backendTest.label, value: "backendTest", checked: true },
    ],
  });

  return selected;
}

// ── 主流程 ───────────────────────────────────────────────────
async function main() {
  console.log(`${c.cyan}${c.bold}🔍 AgentNews — 代码质量检查${c.reset}\n`);
  const start = Date.now();
  const selected = await resolveSelectedTasks();

  if (selected.length === 0) {
    console.log(`${c.yellow}未选择任何检查项，已退出。${c.reset}`);
    process.exit(0);
  }

  console.log(`${c.dim}执行任务: ${selected.map((key) => TASKS[key].label).join(" | ")}${c.reset}`);

  const python = getPythonCmd();
  for (const key of selected) {
    const task = TASKS[key];
    const cmd = task.cmd.replace("__PYTHON__", python);
    runStep(task.label, cmd, task.cwd);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n${c.dim}${"─".repeat(50)}${c.reset}`);

  if (failed === 0) {
    console.log(`${c.green}${c.bold}✅ 全部 ${passed} 项检查通过${c.reset} ${c.dim}(${elapsed}s)${c.reset}\n`);
    return;
  }

  console.log(`${c.red}${c.bold}❌ ${failed}/${passed + failed} 项检查失败:${c.reset}`);
  failures.forEach((f) => console.log(`   ${c.red}•${c.reset} ${f}`));
  console.log(`${c.dim}(${elapsed}s)${c.reset}\n`);
  process.exit(1);
}

main().catch((err) => {
  console.error(`${c.red}${err.message}${c.reset}`);
  process.exit(1);
});
