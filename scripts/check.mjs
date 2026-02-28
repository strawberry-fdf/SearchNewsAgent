#!/usr/bin/env node
/**
 * check.mjs — 代码质量检查脚本
 *
 * 手动运行完整的代码检查流水线（与 pre-commit hook 相同内容）。
 * 适用于 CI 或本地手动执行。
 *
 * 用法:
 *   node scripts/check.mjs              # 执行全部检查
 *   node scripts/check.mjs --frontend   # 仅前端（ts-check + 测试）
 *   node scripts/check.mjs --backend    # 仅后端（pytest）
 *   node scripts/check.mjs --typecheck  # 仅 TypeScript 类型检查
 *   node scripts/check.mjs --test       # 仅测试（前端 + 后端）
 */

import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");

const argv = process.argv.slice(2);
const onlyFrontend = argv.includes("--frontend");
const onlyBackend = argv.includes("--backend");
const onlyTypeCheck = argv.includes("--typecheck");
const onlyTest = argv.includes("--test");
const runAll = !onlyFrontend && !onlyBackend && !onlyTypeCheck && !onlyTest;

const c = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  cyan: "\x1b[36m", green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m",
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

// ── 主流程 ───────────────────────────────────────────────────
console.log(`${c.cyan}${c.bold}🔍 AgentNews — 代码质量检查${c.reset}\n`);
const start = Date.now();

// 前端 TypeScript 类型检查
if (runAll || onlyFrontend || onlyTypeCheck) {
  runStep("前端 TypeScript 类型检查", "npx tsc --noEmit", resolve(ROOT, "frontend"));
}

// 前端测试
if (runAll || onlyFrontend || onlyTest) {
  runStep("前端单元测试 (Vitest, 223 tests)", "npx vitest run --reporter=dot", resolve(ROOT, "frontend"));
}

// 后端测试
if (runAll || onlyBackend || onlyTest) {
  const python = getPythonCmd();
  runStep("后端单元测试 (Pytest, 283 tests)", `${python} -m pytest backend/tests/ -q --tb=short`);
}

// ── 汇总 ─────────────────────────────────────────────────────
const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log(`\n${c.dim}${"─".repeat(50)}${c.reset}`);

if (failed === 0) {
  console.log(`${c.green}${c.bold}✅ 全部 ${passed} 项检查通过${c.reset} ${c.dim}(${elapsed}s)${c.reset}\n`);
} else {
  console.log(`${c.red}${c.bold}❌ ${failed}/${passed + failed} 项检查失败:${c.reset}`);
  failures.forEach((f) => console.log(`   ${c.red}•${c.reset} ${f}`));
  console.log(`${c.dim}(${elapsed}s)${c.reset}\n`);
  process.exit(1);
}
