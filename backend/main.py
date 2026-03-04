"""
应用入口模块 —— 启动 FastAPI 服务器并注册后台定时任务。

职责:
1. 配置全局日志格式
2. 创建 FastAPI 应用实例（含 CORS 中间件）
3. 使用 APScheduler 定时触发采集流水线
4. 提供手动触发采集的 Admin 端点
5. 管理应用生命周期（DB 连接 / Scheduler 启停）

启动方式:
    python -m backend.main
    或
    uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
"""

from __future__ import annotations

import asyncio
import logging
import sys
from contextlib import asynccontextmanager

import uvicorn
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.routes import router
from backend.config import settings
from backend.pipeline import run_ingestion_pipeline
from backend.storage.db import close_db, get_db

# ──────────────────────────────────────────────────────────────
# 日志配置 —— 统一输出格式，级别由 settings.LOG_LEVEL 控制
# ──────────────────────────────────────────────────────────────

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────
# APScheduler 定时调度器 —— 按配置间隔自动执行采集流水线
# ──────────────────────────────────────────────────────────────

scheduler = AsyncIOScheduler()


async def _scheduled_pipeline():
    """
    定时任务回调：执行完整采集 → 分析 → 过滤 → 推送流水线。
    启用 respect_source_intervals 让每个信源按自己的更新频率被采集。
    """
    logger.info("⏰ Scheduled pipeline run triggered.")
    try:
        stats = await run_ingestion_pipeline(respect_source_intervals=True)
        logger.info("⏰ Scheduled pipeline finished: %s", stats)
    except Exception as exc:
        logger.error("⏰ Scheduled pipeline error: %s", exc, exc_info=True)


# ──────────────────────────────────────────────────────────────
# 应用生命周期管理（启动 / 关闭钩子）
# ──────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """管理应用启动与关闭：初始化 DB 连接、启动定时调度、优雅退出。"""
    # Startup
    await get_db()
    logger.info("🚀 AgentNews backend started.")

    # Start scheduler — tick every 5 minutes to check per-source intervals.
    # Each source's own fetch_interval_minutes determines its actual update rate.
    _scheduler_tick_minutes = min(5, settings.FETCH_INTERVAL_MINUTES)
    scheduler.add_job(
        _scheduled_pipeline,
        trigger=IntervalTrigger(minutes=_scheduler_tick_minutes),
        id="ingestion_pipeline",
        name="Periodic ingestion pipeline",
        replace_existing=True,
    )
    scheduler.start()
    logger.info(
        "⏰ Scheduler started (tick=%d min, per-source intervals respected).",
        _scheduler_tick_minutes,
    )

    yield

    # Shutdown
    scheduler.shutdown(wait=False)
    await close_db()
    logger.info("👋 AgentNews backend stopped.")


# ──────────────────────────────────────────────────────────────
# FastAPI 应用实例及中间件配置
# ──────────────────────────────────────────────────────────────

app = FastAPI(
    title="AgentNews API",
    description="AI 智能资讯精选与降噪系统",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS 跨域配置 —— 允许前端开发服务器和 Electron 访问
_allowed_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


# ──────────────────────────────────────────────────────────────
# 管理端点 —— 手动触发采集流水线
# ──────────────────────────────────────────────────────────────

@app.post("/api/admin/run-pipeline")
async def trigger_pipeline():
    """管理员手动触发完整采集流水线（同步等待结果返回）。"""
    stats = await run_ingestion_pipeline()
    return {"status": "ok", "stats": stats}


# ──────────────────────────────────────────────────────────────
# CLI 直接启动入口（python -m backend.main）
# ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import os as _os

    _port = int(_os.getenv("PORT", "8000"))
    _is_electron = bool(_os.getenv("ELECTRON_MODE"))
    uvicorn.run(
        "backend.main:app",
        host="127.0.0.1" if _is_electron else "0.0.0.0",
        port=_port,
        reload=not _is_electron,
    )
