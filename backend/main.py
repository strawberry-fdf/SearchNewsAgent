"""
Main entry point – starts the FastAPI server with background scheduler
for periodic article ingestion.
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
# Logging setup
# ──────────────────────────────────────────────────────────────

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────
# Scheduler
# ──────────────────────────────────────────────────────────────

scheduler = AsyncIOScheduler()


async def _scheduled_pipeline():
    """Wrapper for the scheduler job."""
    logger.info("⏰ Scheduled pipeline run triggered.")
    try:
        stats = await run_ingestion_pipeline()
        logger.info("⏰ Scheduled pipeline finished: %s", stats)
    except Exception as exc:
        logger.error("⏰ Scheduled pipeline error: %s", exc, exc_info=True)


# ──────────────────────────────────────────────────────────────
# App lifecycle
# ──────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown hooks."""
    # Startup
    await get_db()
    logger.info("🚀 AgentNews backend started.")

    # Start scheduler
    scheduler.add_job(
        _scheduled_pipeline,
        trigger=IntervalTrigger(minutes=settings.FETCH_INTERVAL_MINUTES),
        id="ingestion_pipeline",
        name="Periodic ingestion pipeline",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("⏰ Scheduler started (interval=%d min).", settings.FETCH_INTERVAL_MINUTES)

    yield

    # Shutdown
    scheduler.shutdown(wait=False)
    await close_db()
    logger.info("👋 AgentNews backend stopped.")


# ──────────────────────────────────────────────────────────────
# FastAPI app
# ──────────────────────────────────────────────────────────────

app = FastAPI(
    title="AgentNews API",
    description="AI 智能资讯精选与降噪系统",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS – allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


# ──────────────────────────────────────────────────────────────
# Manual trigger endpoint (admin)
# ──────────────────────────────────────────────────────────────

@app.post("/api/admin/run-pipeline")
async def trigger_pipeline():
    """Manually trigger the full ingestion pipeline."""
    stats = await run_ingestion_pipeline()
    return {"status": "ok", "stats": stats}


# ──────────────────────────────────────────────────────────────
# CLI entry
# ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
