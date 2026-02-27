#!/usr/bin/env bash
# ============================================================
# 使用 PyInstaller 将 AgentNews 后端打包为 Linux 可执行文件
# ============================================================
#
# 步骤:
#   1. 激活虚拟环境（如果存在）
#   2. 安装 PyInstaller（如果缺失）
#   3. 执行 PyInstaller 打包
#   4. 将输出移动到 build/backend/ 供 electron-builder 使用
#
# 使用: bash scripts/build-backend.sh

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "========================================"
echo "  AgentNews 后端打包 (Linux)"
echo "========================================"

# ── Step 1: 检查/激活虚拟环境 ────────────────────────────────
VENV_PATH="$PROJECT_ROOT/venv"
if [ -f "$VENV_PATH/bin/activate" ]; then
    echo "[1/5] 激活虚拟环境: $VENV_PATH"
    source "$VENV_PATH/bin/activate"
else
    echo "[1/5] 未找到虚拟环境，使用系统 Python"
fi

# ── Step 2: 确保 PyInstaller 已安装 ──────────────────────────
echo "[2/5] 检查 PyInstaller..."
if ! pip show pyinstaller > /dev/null 2>&1; then
    echo "  -> 安装 PyInstaller..."
    pip install pyinstaller
fi
echo "  -> PyInstaller 就绪"

# ── Step 3: 清理旧构建产物 ───────────────────────────────────
echo "[3/5] 清理旧构建..."
rm -rf "$PROJECT_ROOT/build/backend"
rm -rf "$PROJECT_ROOT/pyinstaller_dist"
rm -rf "$PROJECT_ROOT/pyinstaller_build"

# ── Step 4: 执行 PyInstaller 打包 ────────────────────────────
echo "[4/5] 执行 PyInstaller 打包..."

ENTRY_SCRIPT="$PROJECT_ROOT/scripts/electron-entry.py"

pyinstaller \
    --name=backend \
    --onedir \
    --console \
    --noconfirm \
    --distpath="$PROJECT_ROOT/pyinstaller_dist" \
    --workpath="$PROJECT_ROOT/pyinstaller_build" \
    --add-data="backend:backend" \
    --hidden-import=backend \
    --hidden-import=backend.main \
    --hidden-import=backend.config \
    --hidden-import=backend.pipeline \
    --hidden-import=backend.seed \
    --hidden-import=backend.api \
    --hidden-import=backend.api.routes \
    --hidden-import=backend.ingestion \
    --hidden-import=backend.ingestion.dedup \
    --hidden-import=backend.ingestion.rss_fetcher \
    --hidden-import=backend.ingestion.web_scraper \
    --hidden-import=backend.llm \
    --hidden-import=backend.llm.extractor \
    --hidden-import=backend.llm.prompts \
    --hidden-import=backend.models \
    --hidden-import=backend.models.article \
    --hidden-import=backend.models.source \
    --hidden-import=backend.notification \
    --hidden-import=backend.notification.feishu \
    --hidden-import=backend.rules \
    --hidden-import=backend.rules.engine \
    --hidden-import=backend.storage \
    --hidden-import=backend.storage.db \
    --hidden-import=uvicorn.logging \
    --hidden-import=uvicorn.loops \
    --hidden-import=uvicorn.loops.auto \
    --hidden-import=uvicorn.protocols \
    --hidden-import=uvicorn.protocols.http \
    --hidden-import=uvicorn.protocols.http.auto \
    --hidden-import=uvicorn.protocols.websockets \
    --hidden-import=uvicorn.protocols.websockets.auto \
    --hidden-import=uvicorn.lifespan \
    --hidden-import=uvicorn.lifespan.on \
    --hidden-import=uvicorn.lifespan.off \
    --hidden-import=aiosqlite \
    --hidden-import=feedparser \
    --hidden-import=httpx \
    --hidden-import=markdownify \
    --hidden-import=bs4 \
    --hidden-import=openai \
    --hidden-import=anthropic \
    --hidden-import=pydantic \
    --hidden-import=dotenv \
    --hidden-import=apscheduler \
    --hidden-import=apscheduler.schedulers.asyncio \
    --hidden-import=apscheduler.triggers.interval \
    "$ENTRY_SCRIPT"

# ── Step 5: 移动到 build/backend/ ────────────────────────────
echo "[5/5] 整理输出目录..."
mkdir -p "$PROJECT_ROOT/build"
mv "$PROJECT_ROOT/pyinstaller_dist/backend" "$PROJECT_ROOT/build/backend"

# 创建默认 .env 模板
cat > "$PROJECT_ROOT/build/default.env" << 'EOF'
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
EOF

# 清理临时目录
rm -rf "$PROJECT_ROOT/pyinstaller_dist"
rm -rf "$PROJECT_ROOT/pyinstaller_build"
rm -f "$PROJECT_ROOT/backend.spec"

echo "========================================"
echo "  后端打包完成!"
echo "  输出目录: $PROJECT_ROOT/build/backend"
echo "========================================"
