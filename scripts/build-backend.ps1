<#
.SYNOPSIS
    使用 PyInstaller 将 AgentNews 后端打包为 Windows 可执行文件。

.DESCRIPTION
    此脚本执行以下步骤:
    1. 激活 Python 虚拟环境（如果存在）
    2. 安装 PyInstaller（如果缺失）
    3. 使用 PyInstaller 将后端打包为独立目录（--onedir 模式）
    4. 将输出移动到 build/backend/ 目录供 electron-builder 使用

.NOTES
    运行前确保已创建虚拟环境并安装了 backend/requirements.txt 中的依赖。
#>

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  AgentNews 后端打包 (Windows)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# ── Step 1: 检查/激活虚拟环境 ────────────────────────────────
$VenvPath = Join-Path $ProjectRoot "venv"
$ActivateScript = Join-Path $VenvPath "Scripts\Activate.ps1"

if (Test-Path $ActivateScript) {
    Write-Host "[1/5] 激活虚拟环境: $VenvPath" -ForegroundColor Yellow
    & $ActivateScript
} else {
    Write-Host "[1/5] 未找到虚拟环境，使用系统 Python" -ForegroundColor Yellow
}

# ── Step 2: 确保 PyInstaller 已安装 ──────────────────────────
Write-Host "[2/5] 检查 PyInstaller..." -ForegroundColor Yellow
$pyinstallerCheck = pip show pyinstaller 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  -> 安装 PyInstaller..." -ForegroundColor Gray
    pip install pyinstaller
}
Write-Host "  -> PyInstaller 就绪" -ForegroundColor Green

# ── Step 3: 清理旧构建产物 ───────────────────────────────────
Write-Host "[3/5] 清理旧构建..." -ForegroundColor Yellow
$BuildBackendDir = Join-Path $ProjectRoot "build\backend"
if (Test-Path $BuildBackendDir) {
    Remove-Item -Path $BuildBackendDir -Recurse -Force
}
# 清理 PyInstaller 临时目录
$DistDir = Join-Path $ProjectRoot "pyinstaller_dist"
$BuildDir = Join-Path $ProjectRoot "pyinstaller_build"
if (Test-Path $DistDir) { Remove-Item -Path $DistDir -Recurse -Force }
if (Test-Path $BuildDir) { Remove-Item -Path $BuildDir -Recurse -Force }

# ── Step 4: 执行 PyInstaller 打包 ────────────────────────────
Write-Host "[4/5] 执行 PyInstaller 打包..." -ForegroundColor Yellow
Push-Location $ProjectRoot

$EntryScript = Join-Path $ProjectRoot "scripts\electron-entry.py"

# 收集依赖包的所有子模块（--collect-submodules 让 PyInstaller 自动递归收集）
# 以及 backend 自身所有模块作为 hidden imports
$HiddenImports = @(
    # ── backend 自身模块 ──
    "--hidden-import=backend",
    "--hidden-import=backend.main",
    "--hidden-import=backend.config",
    "--hidden-import=backend.pipeline",
    "--hidden-import=backend.seed",
    "--hidden-import=backend.api",
    "--hidden-import=backend.api.routes",
    "--hidden-import=backend.ingestion",
    "--hidden-import=backend.ingestion.dedup",
    "--hidden-import=backend.ingestion.rss_fetcher",
    "--hidden-import=backend.ingestion.web_scraper",
    "--hidden-import=backend.llm",
    "--hidden-import=backend.llm.extractor",
    "--hidden-import=backend.llm.prompts",
    "--hidden-import=backend.models",
    "--hidden-import=backend.models.article",
    "--hidden-import=backend.models.source",
    "--hidden-import=backend.notification",
    "--hidden-import=backend.notification.feishu",
    "--hidden-import=backend.rules",
    "--hidden-import=backend.rules.engine",
    "--hidden-import=backend.storage",
    "--hidden-import=backend.storage.db",
    # ── fastapi + starlette（递归收集全部子模块） ──
    "--collect-submodules=fastapi",
    "--collect-submodules=starlette",
    # ── uvicorn ──
    "--collect-submodules=uvicorn",
    # ── 其他关键三方库 ──
    "--hidden-import=aiosqlite",
    "--hidden-import=feedparser",
    "--hidden-import=httpx",
    "--hidden-import=httpx._transports",
    "--hidden-import=httpx._transports.default",
    "--hidden-import=httpcore",
    "--collect-submodules=httpcore",
    "--hidden-import=markdownify",
    "--hidden-import=bs4",
    "--hidden-import=openai",
    "--collect-submodules=openai",
    "--hidden-import=anthropic",
    "--collect-submodules=anthropic",
    "--hidden-import=pydantic",
    "--collect-submodules=pydantic",
    "--hidden-import=pydantic_core",
    "--hidden-import=dotenv",
    "--hidden-import=apscheduler",
    "--hidden-import=apscheduler.schedulers.asyncio",
    "--hidden-import=apscheduler.triggers.interval",
    "--hidden-import=anyio",
    "--hidden-import=anyio._backends",
    "--hidden-import=anyio._backends._asyncio",
    "--hidden-import=sniffio",
    "--hidden-import=h11",
    "--hidden-import=multipart",
    "--hidden-import=email_validator"
)

$PyInstallerArgs = @(
    "--name=backend",
    "--onedir",
    "--windowed",
    "--noconfirm",
    "--distpath=$DistDir",
    "--workpath=$BuildDir",
    "--add-data=backend;backend"
) + $HiddenImports + @($EntryScript)

Write-Host "  -> pyinstaller $($PyInstallerArgs -join ' ')" -ForegroundColor Gray
& pyinstaller @PyInstallerArgs

if ($LASTEXITCODE -ne 0) {
    Write-Host "错误: PyInstaller 打包失败!" -ForegroundColor Red
    Pop-Location
    exit 1
}

Pop-Location

# ── Step 4.5: 清理打包产物中的冗余文件 ─────────────────────────
Write-Host "  -> 清理冗余文件 (venv, __pycache__, *.db)..." -ForegroundColor Gray
$CleanupDir = Join-Path $DistDir "backend\_internal\backend"
if (Test-Path $CleanupDir) {
    # 删除误打包的 venv 目录
    $VenvInBuild = Join-Path $CleanupDir "venv"
    if (Test-Path $VenvInBuild) {
        Remove-Item -Path $VenvInBuild -Recurse -Force
        Write-Host "    已删除: venv/ (不需要)" -ForegroundColor Gray
    }
    # 删除所有 __pycache__ 目录
    Get-ChildItem -Path $CleanupDir -Directory -Recurse -Filter "__pycache__" | ForEach-Object {
        Remove-Item -Path $_.FullName -Recurse -Force
    }
    Write-Host "    已删除: 所有 __pycache__/" -ForegroundColor Gray
    # 删除所有 .db / .sqlite 数据库文件
    Get-ChildItem -Path (Join-Path $DistDir "backend") -Recurse -Include "*.db","*.sqlite","*.sqlite3" | ForEach-Object {
        Remove-Item -Path $_.FullName -Force
        Write-Host "    已删除: $($_.Name)" -ForegroundColor Gray
    }
}

# ── Step 5: 移动到 build/backend/ ────────────────────────────
Write-Host "[5/5] 整理输出目录..." -ForegroundColor Yellow
$SourceDir = Join-Path $DistDir "backend"
$TargetDir = Join-Path $ProjectRoot "build\backend"

if (!(Test-Path (Split-Path $TargetDir -Parent))) {
    New-Item -Path (Split-Path $TargetDir -Parent) -ItemType Directory -Force | Out-Null
}

Move-Item -Path $SourceDir -Destination $TargetDir -Force

# 创建默认 .env 模板
$DefaultEnvPath = Join-Path $ProjectRoot "build\default.env"
@"
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
"@ | Set-Content -Path $DefaultEnvPath -Encoding UTF8

# 清理临时目录
if (Test-Path $DistDir) { Remove-Item -Path $DistDir -Recurse -Force }
if (Test-Path $BuildDir) { Remove-Item -Path $BuildDir -Recurse -Force }
$SpecFile = Join-Path $ProjectRoot "backend.spec"
if (Test-Path $SpecFile) { Remove-Item -Path $SpecFile -Force }

Write-Host "========================================" -ForegroundColor Green
Write-Host "  后端打包完成!" -ForegroundColor Green
Write-Host "  输出目录: $TargetDir" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
