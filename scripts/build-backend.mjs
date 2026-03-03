#!/usr/bin/env node
/**
 * 跨平台 PyInstaller 后端打包脚本
 *
 * 替代原先三份平台脚本 (build-backend-mac.sh / build-backend.sh / build-backend.ps1)
 * 统一用 Node.js 实现，自动检测平台并执行对应打包流程。
 *
 * 用法:
 *   node scripts/build-backend.mjs          # 自动检测当前平台
 *   node scripts/build-backend.mjs --mac    # 强制 macOS 模式
 *   node scripts/build-backend.mjs --win    # 强制 Windows 模式
 *   node scripts/build-backend.mjs --linux  # 强制 Linux 模式
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, writeFileSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform } from 'node:os';

// ── 常量 ─────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..');

const ENTRY_SCRIPT = join(PROJECT_ROOT, 'scripts', 'electron-entry.py');
const DIST_DIR = join(PROJECT_ROOT, 'pyinstaller_dist');
const WORK_DIR = join(PROJECT_ROOT, 'pyinstaller_build');
const BUILD_DIR = join(PROJECT_ROOT, 'build');
const OUTPUT_DIR = join(BUILD_DIR, 'backend');

// ── 平台检测 ─────────────────────────────────────────────────
function detectPlatform() {
  const arg = process.argv[2];
  if (arg === '--mac') return 'darwin';
  if (arg === '--win') return 'win32';
  if (arg === '--linux') return 'linux';
  return platform();
}

const HOST_PLATFORM = platform();
const PLATFORM = detectPlatform();
const IS_WIN = PLATFORM === 'win32';
const PLATFORM_LABEL = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' }[PLATFORM] || PLATFORM;
const HOST_PLATFORM_LABEL = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' }[HOST_PLATFORM] || HOST_PLATFORM;

// ── 工具函数 ─────────────────────────────────────────────────
function log(step, msg) {
  console.log(`[${step}] ${msg}`);
}

function run(cmd, opts = {}) {
  console.log(`  -> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: PROJECT_ROOT, ...opts });
}

/** 获取 Python / pip 可执行文件路径（优先虚拟环境） */
function getPythonPaths() {
  const venvDir = join(PROJECT_ROOT, 'venv');
  if (IS_WIN) {
    const venvPython = join(venvDir, 'Scripts', 'python.exe');
    const venvPip = join(venvDir, 'Scripts', 'pip.exe');
    if (existsSync(venvPython)) {
      return { python: venvPython, pip: venvPip, usingVenv: true };
    }
  } else {
    const venvPython = join(venvDir, 'bin', 'python');
    const venvPip = join(venvDir, 'bin', 'pip');
    if (existsSync(venvPython)) {
      return { python: venvPython, pip: venvPip, usingVenv: true };
    }
  }
  return { python: 'python3', pip: 'pip3', usingVenv: false };
}

/** 递归删除目录中匹配的文件/文件夹 */
function cleanBuildArtifacts(dir) {
  if (!existsSync(dir)) return;

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      // 删除 __pycache__ 和 venv 目录
      if (entry.name === '__pycache__' || entry.name === 'venv') {
        rmSync(fullPath, { recursive: true, force: true });
        console.log(`    已删除: ${entry.name}/`);
        continue;
      }
      cleanBuildArtifacts(fullPath);
    } else if (entry.isFile()) {
      // 删除 .db / .sqlite 文件
      if (/\.(db|sqlite|sqlite3)$/i.test(entry.name)) {
        rmSync(fullPath, { force: true });
        console.log(`    已删除: ${entry.name}`);
      }
    }
  }
}

// ── PyInstaller 参数 ─────────────────────────────────────────
// 数据分隔符: macOS/Linux 用 ":", Windows 用 ";"
const DATA_SEP = IS_WIN ? ';' : ':';

// 全部 hidden-imports（backend 自身 + 三方库）
const HIDDEN_IMPORTS = [
  // ── backend 自身模块 ──
  'backend',
  'backend.main',
  'backend.config',
  'backend.pipeline',
  'backend.seed',
  'backend.api',
  'backend.api.routes',
  'backend.ingestion',
  'backend.ingestion.dedup',
  'backend.ingestion.rss_fetcher',
  'backend.ingestion.web_scraper',
  'backend.llm',
  'backend.llm.extractor',
  'backend.llm.prompts',
  'backend.models',
  'backend.models.article',
  'backend.models.source',
  'backend.notification',
  'backend.notification.feishu',
  'backend.rules',
  'backend.rules.engine',
  'backend.storage',
  'backend.storage.db',
  // ── uvicorn ──
  'uvicorn.logging',
  'uvicorn.loops',
  'uvicorn.loops.auto',
  'uvicorn.protocols',
  'uvicorn.protocols.http',
  'uvicorn.protocols.http.auto',
  'uvicorn.protocols.websockets',
  'uvicorn.protocols.websockets.auto',
  'uvicorn.lifespan',
  'uvicorn.lifespan.on',
  'uvicorn.lifespan.off',
  // ── 其他关键三方库 ──
  'aiosqlite',
  'feedparser',
  'httpx',
  'httpx._transports',
  'httpx._transports.default',
  'httpcore',
  'markdownify',
  'bs4',
  'openai',
  'anthropic',
  'pydantic',
  'pydantic_core',
  'dotenv',
  'apscheduler',
  'apscheduler.schedulers.asyncio',
  'apscheduler.triggers.interval',
  'anyio',
  'anyio._backends',
  'anyio._backends._asyncio',
  'sniffio',
  'h11',
  'multipart',
  'email_validator',
];

// 递归收集子模块
const COLLECT_SUBMODULES = [
  'fastapi',
  'starlette',
  'uvicorn',
  'pydantic',
  'openai',
  'anthropic',
  'httpcore',
];

// 排除不需要的模块（避免 collect-submodules 导入失败）
const EXCLUDE_MODULES = [
  'openai.helpers',     // 需要 numpy，本项目不使用 voice_helpers
];

/** 默认 .env 模板内容 */
const DEFAULT_ENV_TEMPLATE = `\
# ============================================================
# AgentNews 配置文件
# ============================================================
# 首次启动时此文件会被复制到用户数据目录。
# 修改后重启应用即可生效。

# ---- LLM Provider: openai 或 anthropic ----
LLM_PROVIDER=openai

# ---- OpenAI ----
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1

# ---- Anthropic ----
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-3-5-haiku-20241022

# ---- 飞书 Webhook (可选) ----
FEISHU_WEBHOOK_URL=
FEISHU_WEBHOOK_SECRET=

# ---- 调度 ----
FETCH_INTERVAL_MINUTES=30

# ---- 日志 ----
LOG_LEVEL=INFO
`;

// ── 主流程 ───────────────────────────────────────────────────
function main() {
  console.log('========================================');
  console.log(`  AgentNews 后端打包 (${PLATFORM_LABEL})`);
  console.log('========================================');

  if (PLATFORM !== HOST_PLATFORM) {
    console.error(`\n❌ 不支持跨平台打包后端: 当前主机 ${HOST_PLATFORM_LABEL}，目标 ${PLATFORM_LABEL}`);
    console.error('PyInstaller 仅支持在目标系统原生构建可执行文件。');
    console.error('请在对应系统本机执行，或通过 CI 在多系统 runner 分别构建。\n');
    process.exit(1);
  }

  // ── Step 1: 检查 Python 环境 ──────────────────────────────
  const { python, pip, usingVenv } = getPythonPaths();
  log('1/5', usingVenv ? `使用虚拟环境: ${join(PROJECT_ROOT, 'venv')}` : '未找到虚拟环境，使用系统 Python');

  // ── Step 2: 确保 PyInstaller 已安装 ────────────────────────
  log('2/5', '检查 PyInstaller...');
  try {
    execSync(`"${pip}" show pyinstaller`, { stdio: 'ignore' });
    console.log('  -> PyInstaller 就绪');
  } catch {
    console.log('  -> 安装 PyInstaller...');
    run(`"${pip}" install pyinstaller`);
  }

  // ── Step 3: 清理旧构建产物 ────────────────────────────────
  log('3/5', '清理旧构建...');
  for (const dir of [OUTPUT_DIR, DIST_DIR, WORK_DIR]) {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  // ── Step 4: 执行 PyInstaller 打包 ─────────────────────────
  log('4/5', '执行 PyInstaller 打包...');

  const args = [
    '--name=backend',
    '--onedir',
    // macOS/Linux 用 --console（子进程模式），Windows 用 --windowed（隐藏控制台窗口）
    IS_WIN ? '--windowed' : '--console',
    '--noconfirm',
    `--distpath="${DIST_DIR}"`,
    `--workpath="${WORK_DIR}"`,
    `--add-data=backend${DATA_SEP}backend`,
    ...HIDDEN_IMPORTS.map(m => `--hidden-import=${m}`),
    ...COLLECT_SUBMODULES.map(m => `--collect-submodules=${m}`),
    ...EXCLUDE_MODULES.map(m => `--exclude-module=${m}`),
    `"${ENTRY_SCRIPT}"`,
  ];

  run(`"${python}" -m PyInstaller ${args.join(' ')}`);

  // ── Step 4.5: 清理打包产物中的冗余文件 ────────────────────
  const internalDir = join(DIST_DIR, 'backend', '_internal', 'backend');
  if (existsSync(internalDir)) {
    console.log('  -> 清理冗余文件 (venv, __pycache__, *.db)...');
    cleanBuildArtifacts(internalDir);
  }

  // ── Step 5: 移动到 build/backend/ ─────────────────────────
  log('5/5', '整理输出目录...');
  if (!existsSync(BUILD_DIR)) {
    mkdirSync(BUILD_DIR, { recursive: true });
  }
  renameSync(join(DIST_DIR, 'backend'), OUTPUT_DIR);

  // 创建默认 .env 模板
  writeFileSync(join(BUILD_DIR, 'default.env'), DEFAULT_ENV_TEMPLATE, 'utf-8');

  // 清理临时目录
  for (const dir of [DIST_DIR, WORK_DIR]) {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  const specFile = join(PROJECT_ROOT, 'backend.spec');
  if (existsSync(specFile)) {
    rmSync(specFile, { force: true });
  }

  console.log('========================================');
  console.log(`  后端打包完成! (${PLATFORM_LABEL})`);
  console.log(`  输出目录: ${OUTPUT_DIR}`);
  console.log('========================================');
}

main();
