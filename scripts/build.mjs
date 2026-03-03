#!/usr/bin/env node
/**
 * build.mjs — 统一构建脚本
 *
 * 标准化的构建流水线：质量检查 → 前端构建 → 后端打包 → Electron 打包
 * 每一步都有清晰的日志输出，任一步骤失败则中止。
 *
 * 用法:
 *   node scripts/build.mjs                # 交互式选择平台并完整构建
 *   node scripts/build.mjs --mac          # macOS 完整构建
 *   node scripts/build.mjs --win          # Windows 完整构建
 *   node scripts/build.mjs --linux        # Linux 完整构建
 *   node scripts/build.mjs --frontend     # 仅构建前端
 *   node scripts/build.mjs --backend      # 仅构建后端（当前平台）
 *   node scripts/build.mjs --skip-checks  # 跳过质量检查（加速调试用）
 *   node scripts/build.mjs --skip-tests   # 仅跳过测试，保留类型检查
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { platform as osPlatform } from "node:os";
import { checkbox } from "@inquirer/prompts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");

// ── 解析参数 ─────────────────────────────────────────────────
const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(`--${name}`);

const targetMac = hasFlag("mac");
const targetWin = hasFlag("win");
const targetLinux = hasFlag("linux");
const onlyFrontend = hasFlag("frontend");
const onlyBackend = hasFlag("backend");
const skipChecks = hasFlag("skip-checks");
const skipTests = hasFlag("skip-tests");

// ── 工具 ─────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  cyan: "\x1b[36m", green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m", magenta: "\x1b[35m",
};

function log(step, msg) {
  console.log(`${c.cyan}[build]${c.reset} ${msg}`);
}

function header(step, total, label) {
  console.log(`\n${c.cyan}${c.bold}[${ step}/${total}]${c.reset} ${c.bold}${label}${c.reset}`);
  console.log(`${c.dim}${"─".repeat(50)}${c.reset}`);
}

function run(cmd, opts = {}) {
  execSync(cmd, { cwd: ROOT, stdio: "inherit", encoding: "utf-8", ...opts });
}

function runSilent(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: "utf-8", stdio: "pipe" }).trim();
  } catch { return ""; }
}

function getPythonCmd() {
  const paths = ["venv/bin/python", "backend/venv/bin/python", ".venv/bin/python"];
  for (const p of paths) {
    if (existsSync(resolve(ROOT, p))) return resolve(ROOT, p);
  }
  return "python";
}

function getVersion() {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf-8"));
  return pkg.version;
}

// ── 平台检测 ─────────────────────────────────────────────────
async function resolvePlatforms() {
  const fromFlags = [];
  if (targetMac) fromFlags.push("mac");
  if (targetWin) fromFlags.push("win");
  if (targetLinux) fromFlags.push("linux");

  if (fromFlags.length > 0) {
    return [...new Set(fromFlags)];
  }

  if (onlyFrontend || onlyBackend) return [detectCurrentPlatform()];

  const current = detectCurrentPlatform();
  const selected = await checkbox({
    message: `选择目标平台（可多选，空格勾选，回车确认）｜当前系统: ${platformLabel(current)}`,
    required: true,
    choices: [
      { name: "macOS (DMG)", value: "mac", checked: current === "mac" },
      { name: "Windows (NSIS Setup)", value: "win", checked: current === "win" },
      { name: "Linux (AppImage)", value: "linux", checked: current === "linux" },
    ],
  });

  return [...new Set(selected)];
}

function detectCurrentPlatform() {
  const p = osPlatform();
  if (p === "darwin") return "mac";
  if (p === "win32") return "win";
  return "linux";
}

function platformLabel(p) {
  return { mac: "macOS", win: "Windows", linux: "Linux" }[p] || p;
}

// ── 主流程 ───────────────────────────────────────────────────
async function main() {
  const version = getVersion();
  console.log(`\n${c.cyan}${c.bold}📦 AgentNews v${version} — 构建流水线${c.reset}\n`);

  const selectedPlatforms = await resolvePlatforms();
  const hostPlatform = detectCurrentPlatform();
  const runnablePlatforms = onlyFrontend
    ? []
    : selectedPlatforms.filter((p) => p === hostPlatform);
  const skippedPlatforms = onlyFrontend
    ? []
    : selectedPlatforms.filter((p) => p !== hostPlatform);

  if (!onlyFrontend && runnablePlatforms.length === 0) {
    console.log(`${c.red}❌ 未选择可在当前主机构建的平台${c.reset}`);
    console.log(`${c.dim}当前主机: ${platformLabel(hostPlatform)}${c.reset}`);
    console.log(`${c.dim}说明: 后端 PyInstaller 仅支持目标系统原生构建。${c.reset}`);
    process.exit(1);
  }

  if (skippedPlatforms.length > 0) {
    console.log(`${c.yellow}⚠ 已跳过不可跨平台构建目标: ${skippedPlatforms.map(platformLabel).join(", ")}${c.reset}`);
    console.log(`${c.dim}原因: 后端 PyInstaller 不支持跨平台打包。${c.reset}\n`);
  }

  const totalSteps = computeSteps(runnablePlatforms.length);

  console.log(`\n${c.dim}已选平台: ${c.reset}${c.bold}${selectedPlatforms.map(platformLabel).join(", ")}${c.reset}`);
  if (!onlyFrontend) {
    console.log(`${c.dim}执行平台: ${c.reset}${c.bold}${runnablePlatforms.map(platformLabel).join(", ")}${c.reset}`);
  }
  console.log(`${c.dim}版本号:   ${c.reset}${c.bold}v${version}${c.reset}`);
  if (skipChecks) console.log(`${c.yellow}⚠ 跳过所有质量检查${c.reset}`);
  if (skipTests) console.log(`${c.yellow}⚠ 跳过测试，保留类型检查${c.reset}`);
  console.log();

  const start = Date.now();
  let step = 0;

  // ── Step 1: TypeScript 类型检查 ──
  if (!skipChecks) {
    step++;
    header(step, totalSteps, "前端 TypeScript 类型检查");
    try {
      run("npx tsc --noEmit", { cwd: resolve(ROOT, "frontend") });
      console.log(`${c.green}✅ 类型检查通过${c.reset}`);
    } catch {
      console.log(`${c.red}❌ TypeScript 类型检查失败，中止构建${c.reset}`);
      process.exit(1);
    }
  }

  // ── Step 2: 前端测试 ──
  if (!skipChecks && !skipTests) {
    step++;
    header(step, totalSteps, "前端单元测试 (Vitest)");
    try {
      run("npx vitest run --reporter=dot", { cwd: resolve(ROOT, "frontend") });
      console.log(`${c.green}✅ 前端测试通过${c.reset}`);
    } catch {
      console.log(`${c.red}❌ 前端测试失败，中止构建${c.reset}`);
      process.exit(1);
    }
  }

  // ── Step 3: 后端测试 ──
  if (!skipChecks && !skipTests && !onlyFrontend) {
    step++;
    header(step, totalSteps, "后端单元测试 (Pytest)");
    try {
      const python = getPythonCmd();
      run(`${python} -m pytest backend/tests/ -q --tb=short`);
      console.log(`${c.green}✅ 后端测试通过${c.reset}`);
    } catch {
      console.log(`${c.red}❌ 后端测试失败，中止构建${c.reset}`);
      process.exit(1);
    }
  }

  // ── Step 4: 前端构建 ──
  if (!onlyBackend) {
    step++;
    header(step, totalSteps, "前端构建 (Next.js 静态导出)");
    try {
      run("pnpm --prefix frontend build:electron");
      console.log(`${c.green}✅ 前端构建完成${c.reset}`);
    } catch {
      console.log(`${c.red}❌ 前端构建失败${c.reset}`);
      process.exit(1);
    }
  }

  // ── Step 5: 后端打包 ──
  if (!onlyFrontend) {
    for (const platform of runnablePlatforms) {
      step++;
      header(step, totalSteps, `后端打包 (PyInstaller → ${platformLabel(platform)})`);
      try {
        run(`node scripts/build-backend.mjs --${platform}`);
        console.log(`${c.green}✅ 后端打包完成 (${platformLabel(platform)})${c.reset}`);
      } catch {
        console.log(`${c.red}❌ 后端打包失败 (${platformLabel(platform)})${c.reset}`);
        process.exit(1);
      }
    }
  }

  // ── Step 6: Electron 打包 ──
  if (!onlyFrontend && !onlyBackend) {
    for (const platform of runnablePlatforms) {
      step++;
      header(step, totalSteps, `Electron 打包 (${platformLabel(platform)})`);
      try {
        const platformFlag = { mac: "--mac", win: "--win", linux: "--linux" }[platform];
        run(`npx electron-builder ${platformFlag}`);
        console.log(`${c.green}✅ Electron 打包完成 (${platformLabel(platform)})${c.reset}`);
      } catch {
        console.log(`${c.red}❌ Electron 打包失败 (${platformLabel(platform)})${c.reset}`);
        process.exit(1);
      }
    }
  }

  // ── 汇总 ──
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n${c.dim}${"─".repeat(50)}${c.reset}`);
  console.log(`${c.green}${c.bold}🎉 构建完成！${c.reset} ${c.dim}(${elapsed}s)${c.reset}`);
  const summaryPlatforms = onlyFrontend ? [hostPlatform] : runnablePlatforms;
  console.log(`${c.dim}版本: v${version} | 平台: ${summaryPlatforms.map(platformLabel).join(", ")}${c.reset}`);

  if (!onlyFrontend && !onlyBackend) {
    console.log(`${c.dim}产物目录: dist/${c.reset}`);
  }
  console.log();

  function computeSteps(platformCount) {
    let n = 0;
    if (!skipChecks) n++; // ts-check
    if (!skipChecks && !skipTests) n++; // frontend test
    if (!skipChecks && !skipTests && !onlyFrontend) n++; // backend test
    if (!onlyBackend) n++; // frontend build
    if (!onlyFrontend) n += platformCount; // backend build
    if (!onlyFrontend && !onlyBackend) n += platformCount; // electron build
    return n;
  }
}

main().catch((err) => {
  console.error(`${c.red}构建异常: ${err.message}${c.reset}`);
  process.exit(1);
});
