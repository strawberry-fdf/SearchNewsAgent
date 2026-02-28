#!/usr/bin/env node
/**
 * commit.mjs — 规范化提交脚本
 *
 * 交互式引导开发者创建符合 Conventional Commits 规范的提交。
 * 自动执行:  暂存 → pre-commit 检查（Husky）→ commitlint 校验 → 提交 → 可选推送
 *
 * 用法:
 *   node scripts/commit.mjs                          # 交互式提交
 *   node scripts/commit.mjs --type feat --msg "新功能"  # 快捷非交互提交
 *   node scripts/commit.mjs --push                    # 提交后自动推送
 *   node scripts/commit.mjs --skip-checks             # 跳过 pre-commit 检查（紧急用）
 */

import { execSync } from "node:child_process";
import { createInterface } from "node:readline";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");

// ── 解析命令行参数 ──────────────────────────────────────────────
const argv = process.argv.slice(2);
function getArg(name) {
  const idx = argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return argv[idx + 1];
}
const hasFlag = (name) => argv.includes(`--${name}`);

const argType = getArg("type");
const argScope = getArg("scope");
const argMsg = getArg("msg");
const autoPush = hasFlag("push");
const skipChecks = hasFlag("skip-checks");

// ── 常量 ──────────────────────────────────────────────────────
const TYPES = [
  { value: "feat",     desc: "新功能" },
  { value: "fix",      desc: "修复 Bug" },
  { value: "docs",     desc: "文档变更" },
  { value: "style",    desc: "代码格式（不影响逻辑）" },
  { value: "refactor", desc: "重构（不增功能也不修 Bug）" },
  { value: "perf",     desc: "性能优化" },
  { value: "test",     desc: "添加/修改测试" },
  { value: "build",    desc: "构建系统或外部依赖变更" },
  { value: "ci",       desc: "CI/CD 配置变更" },
  { value: "chore",    desc: "杂项（不修改 src/test）" },
  { value: "revert",   desc: "回退提交" },
];

const SCOPES = ["frontend", "backend", "electron", "pipeline", "api", "llm", "ingestion", "config", "scripts", "docs"];

// ── 工具函数 ──────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
};

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT, encoding: "utf-8", stdio: opts.silent ? "pipe" : "inherit", ...opts }).trim();
}

function runSilent(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: "utf-8", stdio: "pipe" }).trim();
  } catch {
    return "";
  }
}

// ── readline 工具 ─────────────────────────────────────────────
const rl = createInterface({ input: process.stdin, output: process.stdout });
function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

// ── 主流程 ───────────────────────────────────────────────────
async function main() {
  console.log(`\n${c.cyan}${c.bold}📝 AgentNews — 规范化提交${c.reset}\n`);

  // 检查是否有变更
  const status = runSilent("git status --porcelain");
  if (!status) {
    console.log(`${c.yellow}⚠ 工作区没有任何变更，无需提交${c.reset}`);
    process.exit(0);
  }

  // 显示变更概览
  console.log(`${c.dim}── 工作区变更 ──${c.reset}`);
  run("git status --short");
  console.log();

  // 暂存文件
  const stageAnswer = await ask(`${c.cyan}?${c.reset} 暂存所有变更？(Y/n) `);
  if (stageAnswer.toLowerCase() !== "n") {
    run("git add -A", { silent: true });
    console.log(`${c.green}✓${c.reset} 已暂存所有变更\n`);
  } else {
    // 检查暂存区是否有内容
    const staged = runSilent("git diff --cached --name-only");
    if (!staged) {
      console.log(`${c.yellow}⚠ 暂存区为空，请先 git add 再提交${c.reset}`);
      process.exit(1);
    }
  }

  // ── 选择 type ──
  let type = argType;
  if (!type) {
    console.log(`${c.dim}── 选择提交类型 ──${c.reset}`);
    TYPES.forEach((t, i) => {
      console.log(`  ${c.cyan}${String(i + 1).padStart(2)}${c.reset}) ${c.bold}${t.value.padEnd(10)}${c.reset} ${c.dim}${t.desc}${c.reset}`);
    });
    const typeIdx = await ask(`\n${c.cyan}?${c.reset} 输入编号 (1-${TYPES.length}): `);
    const idx = parseInt(typeIdx, 10) - 1;
    if (idx < 0 || idx >= TYPES.length) {
      console.log(`${c.red}✗ 无效选择${c.reset}`);
      process.exit(1);
    }
    type = TYPES[idx].value;
    console.log(`${c.green}✓${c.reset} 类型: ${c.bold}${type}${c.reset}\n`);
  }

  // ── 选择 scope（可选） ──
  let scope = argScope ?? "";
  if (!argScope && argScope !== "") {
    console.log(`${c.dim}── 选择影响范围 (可选，直接回车跳过) ──${c.reset}`);
    SCOPES.forEach((s, i) => {
      console.log(`  ${c.cyan}${String(i + 1).padStart(2)}${c.reset}) ${s}`);
    });
    const scopeInput = await ask(`\n${c.cyan}?${c.reset} 输入编号或自定义 scope: `);
    if (scopeInput) {
      const scopeIdx = parseInt(scopeInput, 10) - 1;
      scope = (scopeIdx >= 0 && scopeIdx < SCOPES.length) ? SCOPES[scopeIdx] : scopeInput;
    }
    if (scope) console.log(`${c.green}✓${c.reset} 范围: ${c.bold}${scope}${c.reset}\n`);
  }

  // ── 输入消息 ──
  let msg = argMsg;
  if (!msg) {
    msg = await ask(`${c.cyan}?${c.reset} 提交信息 (简短描述): `);
    if (!msg.trim()) {
      console.log(`${c.red}✗ 提交信息不能为空${c.reset}`);
      process.exit(1);
    }
    console.log();
  }

  // ── 构建 commit message ──
  const scopePart = scope ? `(${scope})` : "";
  const commitMsg = `${type}${scopePart}: ${msg.trim()}`;
  console.log(`${c.dim}── 提交信息预览 ──${c.reset}`);
  console.log(`  ${c.magenta}${commitMsg}${c.reset}\n`);

  // ── 确认提交 ──
  const confirm = await ask(`${c.cyan}?${c.reset} 确认提交？(Y/n) `);
  if (confirm.toLowerCase() === "n") {
    console.log(`${c.yellow}⚠ 已取消提交${c.reset}`);
    process.exit(0);
  }

  // ── 执行提交 ──
  try {
    const skipFlag = skipChecks ? "--no-verify " : "";
    run(`git commit ${skipFlag}-m "${commitMsg.replace(/"/g, '\\"')}"`, { silent: false });
    console.log(`\n${c.green}✓ 提交成功${c.reset}`);
  } catch (e) {
    console.log(`\n${c.red}✗ 提交失败（检查不通过或 commitlint 校验失败）${c.reset}`);
    process.exit(1);
  }

  // ── 推送 ──
  if (autoPush) {
    console.log(`\n${c.cyan}↑${c.reset} 正在推送到远程...`);
    try {
      run("git push", { silent: false });
      console.log(`${c.green}✓ 推送成功${c.reset}`);
    } catch {
      console.log(`${c.red}✗ 推送失败，请手动执行 git push${c.reset}`);
    }
  } else {
    const pushAnswer = await ask(`\n${c.cyan}?${c.reset} 是否推送到远程？(y/N) `);
    if (pushAnswer.toLowerCase() === "y") {
      try {
        run("git push", { silent: false });
        console.log(`${c.green}✓ 推送成功${c.reset}`);
      } catch {
        console.log(`${c.red}✗ 推送失败，请手动执行 git push${c.reset}`);
      }
    }
  }

  rl.close();
  console.log();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
