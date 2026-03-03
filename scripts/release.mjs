#!/usr/bin/env node
/**
 * release.mjs — UX 优先的版本发布脚本
 *
 * 目标：让发布过程“可见、可控、低心智负担”。
 * 流程：选择版本 → 输入提交信息 → 预览确认 → 版本更新 → 提交/打标/推送
 *
 * 用法:
 *   node scripts/release.mjs                # 交互式发布（推荐）
 *   node scripts/release.mjs patch          # 1.0.0 → 1.0.1（补丁修复）
 *   node scripts/release.mjs minor          # 1.0.0 → 1.1.0（新功能）
 *   node scripts/release.mjs major          # 1.0.0 → 2.0.0（破坏性变更）
 *   node scripts/release.mjs --version 2.1.0 # 指定精确版本号
 *   node scripts/release.mjs --build        # 发布后自动打包当前平台
 *   node scripts/release.mjs patch --yes --push # 无交互：递增版本 + commit + tag + push
 *   node scripts/release.mjs patch --yes --push --allow-dirty # 包含当前未提交改动一起发布
 *   node scripts/release.mjs patch --dry-run # 预览模式（不实际执行）
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { confirm, input, select } from "@inquirer/prompts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");

// ── 解析参数 ─────────────────────────────────────────────────
const argv = process.argv.slice(2).filter((arg) => arg !== "--");
const bumpType = argv.find((a) => ["major", "minor", "patch"].includes(a));
const explicitVersion = argv.includes("--version") ? argv[argv.indexOf("--version") + 1] : null;
const dryRun = argv.includes("--dry-run");
const autoBuild = argv.includes("--build");
const yesMode = argv.includes("--yes") || argv.includes("-y");
const forcePush = argv.includes("--push");
const skipPush = argv.includes("--skip-push") || argv.includes("--no-push");
const allowDirty = argv.includes("--allow-dirty") || yesMode;
const messageIndex = argv.findIndex((a) => a === "--message" || a === "-m");
const customCommitMessage = messageIndex >= 0 ? argv[messageIndex + 1] : "";

// ── 工具函数 ──────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  cyan: "\x1b[36m", green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m", magenta: "\x1b[35m",
};

function run(cmd, opts = {}) {
  if (dryRun) {
    console.log(`${c.dim}  [dry-run] ${cmd}${c.reset}`);
    return "";
  }
  return execSync(cmd, { cwd: ROOT, encoding: "utf-8", stdio: opts.silent ? "pipe" : "inherit", ...opts }).trim();
}

function runSilent(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: "utf-8", stdio: "pipe" }).trim();
  } catch { return ""; }
}

// ── 版本号工具 ────────────────────────────────────────────────
function parseVersion(ver) {
  const match = ver.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) throw new Error(`无效版本号: ${ver}`);
  return { major: +match[1], minor: +match[2], patch: +match[3] };
}

function bumpVersion(current, type) {
  const v = parseVersion(current);
  switch (type) {
    case "major": return `${v.major + 1}.0.0`;
    case "minor": return `${v.major}.${v.minor + 1}.0`;
    case "patch": return `${v.major}.${v.minor}.${v.patch + 1}`;
    default: throw new Error(`未知 bump 类型: ${type}`);
  }
}

// ── 读写 package.json ─────────────────────────────────────────
function readPkg(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function writePkg(path, pkg) {
  writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
}

// ── 收集 conventional commits 日志 ────────────────────────────
function collectChangelog(fromTag) {
  const range = fromTag ? `${fromTag}..HEAD` : "HEAD~20..HEAD";
  const logs = runSilent(`git --no-pager log ${range} --format="%s" --no-merges`);
  if (!logs) return "";

  const sections = {
    feat: { title: "✨ 新功能", items: [] },
    fix: { title: "🐛 修复", items: [] },
    perf: { title: "⚡ 性能", items: [] },
    refactor: { title: "♻️ 重构", items: [] },
    docs: { title: "📝 文档", items: [] },
    test: { title: "✅ 测试", items: [] },
    build: { title: "📦 构建", items: [] },
    ci: { title: "🔧 CI", items: [] },
    style: { title: "💄 样式", items: [] },
    chore: { title: "🔩 杂项", items: [] },
  };

  for (const line of logs.split("\n")) {
    const match = line.match(/^(\w+)(?:\(([^)]*)\))?\s*:\s*(.+)$/);
    if (match) {
      const [, type, scope, msg] = match;
      const section = sections[type];
      if (section) {
        section.items.push(scope ? `**${scope}**: ${msg}` : msg);
      }
    }
  }

  let changelog = "";
  for (const sec of Object.values(sections)) {
    if (sec.items.length > 0) {
      changelog += `### ${sec.title}\n`;
      sec.items.forEach((item) => { changelog += `- ${item}\n`; });
      changelog += "\n";
    }
  }
  return changelog;
}

// ── 主流程 ───────────────────────────────────────────────────
async function main() {
  console.log(`\n${c.cyan}${c.bold}🚀 AgentNews — 版本发布${c.reset}`);
  if (dryRun) console.log(`${c.yellow}  (预览模式 — 不会实际执行任何变更)${c.reset}`);
  console.log();

  // 检查工作区状态
  const dirty = runSilent("git status --porcelain");
  if (dirty && !dryRun) {
    if (!allowDirty) {
      const dirtyConfirm = await confirm({
        message: "检测到未提交改动，是否将当前改动一并纳入本次发布？",
        default: true,
      });
      if (!dirtyConfirm) {
        console.log(`${c.yellow}⚠ 已取消${c.reset}`);
        process.exit(0);
      }
    }
    console.log(`${c.dim}检测到工作区改动，将在本次发布中一并提交。${c.reset}`);
  }

  // 读取当前版本
  const rootPkg = readPkg(resolve(ROOT, "package.json"));
  const currentVersion = rootPkg.version;
  console.log(`${c.dim}当前版本:${c.reset} ${c.bold}v${currentVersion}${c.reset}`);

  // 计算新版本
  let newVersion;
  if (explicitVersion) {
    parseVersion(explicitVersion); // 校验格式
    newVersion = explicitVersion;
  } else if (bumpType) {
    newVersion = bumpVersion(currentVersion, bumpType);
  } else if (yesMode) {
    // 无交互模式下默认 patch
    newVersion = bumpVersion(currentVersion, "patch");
  } else {
    const selectedType = await select({
      message: "选择版本递增类型",
      choices: [
        { name: `patch  (${bumpVersion(currentVersion, "patch")})  补丁修复`, value: "patch" },
        { name: `minor  (${bumpVersion(currentVersion, "minor")})  新功能`, value: "minor" },
        { name: `major  (${bumpVersion(currentVersion, "major")})  破坏性变更`, value: "major" },
      ],
      default: "patch",
    });
    newVersion = bumpVersion(currentVersion, selectedType);
  }

  console.log(`${c.dim}新版本:${c.reset}   ${c.green}${c.bold}v${newVersion}${c.reset}\n`);

  const defaultCommitMessage = `chore(release): v${newVersion}`;
  let commitMessage = customCommitMessage || defaultCommitMessage;
  if (!customCommitMessage && !yesMode) {
    const inputMessage = await input({
      message: "输入 commit message（回车使用默认）",
      default: defaultCommitMessage,
    });
    commitMessage = inputMessage.trim() || defaultCommitMessage;
  }

  // 确认
  if (!yesMode) {
    console.log(`${c.dim}发布预览: v${currentVersion} -> v${newVersion}${c.reset}`);
    console.log(`${c.dim}提交信息: ${commitMessage}${c.reset}`);
    const shouldContinue = await confirm({
      message: "确认继续发布？",
      default: true,
    });
    if (!shouldContinue) {
      console.log(`${c.yellow}⚠ 已取消${c.reset}`);
      process.exit(0);
    }
  } else {
    console.log(`${c.dim}无交互模式: 已自动确认发布${c.reset}`);
  }

  // ── 1. 更新版本号 ──
  console.log(`\n${c.cyan}[1/5]${c.reset} 更新版本号...`);

  // 根 package.json
  rootPkg.version = newVersion;
  if (!dryRun) writePkg(resolve(ROOT, "package.json"), rootPkg);
  console.log(`  ${c.green}✓${c.reset} package.json → ${newVersion}`);

  // 前端 package.json（同步版本号）
  const frontendPkgPath = resolve(ROOT, "frontend/package.json");
  if (existsSync(frontendPkgPath)) {
    const frontendPkg = readPkg(frontendPkgPath);
    frontendPkg.version = newVersion;
    if (!dryRun) writePkg(frontendPkgPath, frontendPkg);
    console.log(`  ${c.green}✓${c.reset} frontend/package.json → ${newVersion}`);
  }

  // electron-builder.yml（如果有 version 字段）
  const eBuilderPath = resolve(ROOT, "electron-builder.yml");
  if (existsSync(eBuilderPath)) {
    let yml = readFileSync(eBuilderPath, "utf-8");
    // 更新 buildVersion 如果存在
    if (yml.includes("buildVersion:")) {
      yml = yml.replace(/buildVersion:\s*["']?[\d.]+["']?/, `buildVersion: "${newVersion}"`);
      if (!dryRun) writeFileSync(eBuilderPath, yml, "utf-8");
      console.log(`  ${c.green}✓${c.reset} electron-builder.yml → ${newVersion}`);
    }
  }

  // ── 2. 生成 CHANGELOG 条目 ──
  console.log(`\n${c.cyan}[2/5]${c.reset} 生成 CHANGELOG 条目...`);

  const lastTag = runSilent("git describe --tags --abbrev=0 2>/dev/null");
  const changelogEntry = collectChangelog(lastTag);
  const dateStr = new Date().toISOString().split("T")[0];

  const changelogPath = resolve(ROOT, "CHANGELOG.md");
  const header = `## [${newVersion}] - ${dateStr}\n\n`;
  const entry = changelogEntry || "- 版本更新\n\n";

  if (existsSync(changelogPath)) {
    const existing = readFileSync(changelogPath, "utf-8");
    if (!dryRun) writeFileSync(changelogPath, header + entry + existing, "utf-8");
  } else {
    const content = `# Changelog\n\n${header}${entry}`;
    if (!dryRun) writeFileSync(changelogPath, content, "utf-8");
  }
  console.log(`  ${c.green}✓${c.reset} CHANGELOG.md 已更新`);

  if (changelogEntry) {
    console.log(`${c.dim}${changelogEntry}${c.reset}`);
  }

  // ── 3. 提交版本变更 ──
  console.log(`${c.cyan}[3/5]${c.reset} 提交版本变更...`);
  run("git add -A", { silent: true });
  run(`git commit --no-verify -m "${commitMessage.replace(/"/g, '\\"')}"`, { silent: true });
  console.log(`  ${c.green}✓${c.reset} 已提交: ${commitMessage}`);

  // ── 4. 创建 Tag ──
  console.log(`\n${c.cyan}[4/5]${c.reset} 创建 Git Tag...`);
  run(`git tag -a v${newVersion} -m "Release v${newVersion}"`, { silent: true });
  console.log(`  ${c.green}✓${c.reset} Tag: v${newVersion}`);

  // ── 5. 推送 ──
  console.log(`\n${c.cyan}[5/5]${c.reset} 推送到远程...`);
  let shouldPush = false;
  if (forcePush) {
    shouldPush = true;
  } else if (skipPush) {
    shouldPush = false;
  } else if (yesMode) {
    shouldPush = true;
  } else {
    shouldPush = await confirm({
      message: "推送 commit + tag 到远程？",
      default: true,
    });
  }

  if (shouldPush) {
    run("git push", { silent: true });
    run("git push --tags", { silent: true });
    console.log(`  ${c.green}✓${c.reset} 已推送到远程`);
  } else {
    console.log(`  ${c.yellow}⚠${c.reset} 跳过推送，稍后手动执行:`);
    console.log(`    git push && git push --tags`);
  }

  // ── 可选: 打包 ──
  if (autoBuild) {
    console.log(`\n${c.cyan}[bonus]${c.reset} 开始打包当前平台...`);
    const platform = process.platform === "darwin" ? "mac" : process.platform === "win32" ? "win" : "linux";
    run(`pnpm build -- --${platform}`, { silent: false });
  }

  console.log(`\n${c.green}${c.bold}🎉 v${newVersion} 发布完成！${c.reset}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
