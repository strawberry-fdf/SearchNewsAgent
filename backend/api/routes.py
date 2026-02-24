"""
FastAPI routes – REST API for the frontend and admin operations.
"""

import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import logging

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend.storage import db

logger = logging.getLogger(__name__)

router = APIRouter()

# ── Pipeline execution state ──
_pipeline_state: Dict[str, Any] = {
    "running": False,
    "logs": [],
    "stats": None,
    "queues": set(),
}


def _emit_log(msg: str):
    """Append log message and notify all SSE listeners."""
    _pipeline_state["logs"].append(msg)
    for q in list(_pipeline_state["queues"]):
        try:
            q.put_nowait(msg)
        except Exception:
            pass


async def _run_pipeline_bg():
    run_id = str(uuid.uuid4())
    started_at = datetime.now(timezone.utc).isoformat()
    _pipeline_state["running"] = True
    _pipeline_state["logs"] = []
    _pipeline_state["stats"] = None
    run_status = "done"
    try:
        from backend.pipeline import run_ingestion_pipeline
        app_settings = await db.get_settings()
        filter_prompt = app_settings.get("llm_filter_prompt", "")
        stats = await run_ingestion_pipeline(progress_cb=_emit_log, filter_prompt=filter_prompt)
        _pipeline_state["stats"] = stats
        _emit_log("__DONE__")
    except Exception as exc:
        _emit_log(f"__ERROR__ {exc}")
        run_status = "error"
        logger.error("Pipeline background task error: %s", exc, exc_info=True)
    finally:
        _pipeline_state["running"] = False
        finished_at = datetime.now(timezone.utc).isoformat()
        # persist run (skip __DONE__ and __ERROR__ sentinel lines)
        saved_logs = [l for l in _pipeline_state["logs"] if not l.startswith("__")]
        await db.save_pipeline_run(
            run_id=run_id,
            started_at=started_at,
            finished_at=finished_at,
            logs=saved_logs,
            stats=_pipeline_state["stats"] or {},
            status=run_status,
        )


# ──────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────

def _serialize_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Convert DB document to JSON-safe dict."""
    if "_id" in doc:
        doc["id"] = str(doc.pop("_id"))

    for key in ("fetched_at", "analyzed_at", "published_at", "created_at", "last_fetched_at"):
        if key in doc and doc[key] is not None:
            if hasattr(doc[key], "isoformat"):
                doc[key] = doc[key].isoformat()
            else:
                doc[key] = str(doc[key])
    return doc


# ──────────────────────────────────────────────────────────────
# Article endpoints
# ──────────────────────────────────────────────────────────────

@router.get("/api/articles")
async def list_articles(
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    tags: Optional[str] = Query(None, description="Comma-separated interest tags"),
    keyword: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=100),
):
    """List articles with optional filters."""
    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else None

    if status == "selected":
        docs = await db.get_selected_articles(skip=skip, limit=limit, category=category,
                                              tags=tag_list, keyword=keyword)
        total = await db.count_selected_articles(category=category, tags=tag_list, keyword=keyword)
    else:
        docs = await db.get_all_articles(skip=skip, limit=limit, status=status)
        total = await db.count_articles(status=status)

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "items": [_serialize_doc(d) for d in docs],
    }


@router.get("/api/articles/selected")
async def list_selected_articles(
    category: Optional[str] = Query(None),
    tags: Optional[str] = Query(None, description="Comma-separated interest tags"),
    keyword: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=100),
):
    """Convenience endpoint – only selected articles, with optional tag/keyword filter."""
    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else None
    docs = await db.get_selected_articles(skip=skip, limit=limit, category=category,
                                          tags=tag_list, keyword=keyword)
    total = await db.count_selected_articles(category=category, tags=tag_list, keyword=keyword)
    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "items": [_serialize_doc(d) for d in docs],
    }


@router.post("/api/articles/{url_hash}/star")
async def toggle_article_star(url_hash: str):
    """Toggle starred state on an article."""
    new_state = await db.toggle_star(url_hash)
    return {"starred": new_state}


class UserTagsUpdate(BaseModel):
    tags: List[str] = Field(default_factory=list)


@router.put("/api/articles/{url_hash}/user-tags")
async def update_article_user_tags(url_hash: str, body: UserTagsUpdate):
    """Update manually-assigned user tags on an article."""
    ok = await db.update_article_user_tags(url_hash, body.tags)
    if not ok:
        raise HTTPException(status_code=404, detail="Article not found")
    return {"status": "ok", "tags": body.tags}


@router.delete("/api/articles/batch")
async def delete_articles_batch(url_hashes: List[str] = None):
    """Delete multiple articles by url_hash list (JSON body)."""
    if not url_hashes:
        raise HTTPException(status_code=400, detail="url_hashes required")
    count = await db.delete_articles_batch(url_hashes)
    return {"status": "ok", "deleted": count}


class BatchDeleteBody(BaseModel):
    url_hashes: List[str]


@router.post("/api/articles/batch-delete")
async def delete_articles_batch_post(body: BatchDeleteBody):
    """Delete multiple articles (POST body) by url_hash list."""
    count = await db.delete_articles_batch(body.url_hashes)
    return {"status": "ok", "deleted": count}


@router.delete("/api/articles/{url_hash}")
async def delete_article(url_hash: str):
    """Delete a single article by url_hash."""
    deleted = await db.delete_article(url_hash)
    if not deleted:
        raise HTTPException(status_code=404, detail="Article not found")
    return {"status": "deleted"}


@router.get("/api/stats")
async def get_stats():
    """Dashboard statistics."""
    total = await db.count_articles()
    selected = await db.count_articles(status="selected")
    rejected = await db.count_articles(status="rejected")
    pending = await db.count_articles(status="pending")
    return {
        "total": total,
        "selected": selected,
        "rejected": rejected,
        "pending": pending,
    }


# ──────────────────────────────────────────────────────────────
# Source management endpoints
# ──────────────────────────────────────────────────────────────

class SourceCreate(BaseModel):
    name: str
    url: str
    source_type: str = "rss"
    tags: List[str] = Field(default_factory=list)
    enabled: bool = True
    fetch_interval_minutes: int = 30
    category: str = ""


class SourceUpdate(BaseModel):
    enabled: Optional[bool] = None
    category: Optional[str] = None
    name: Optional[str] = None
    tags: Optional[List[str]] = None
    fetch_interval_minutes: Optional[int] = None


@router.get("/api/sources")
async def list_sources():
    """List all configured sources."""
    docs = await db.get_all_sources(enabled_only=False)
    return {"items": [_serialize_doc(d) for d in docs]}


@router.post("/api/sources")
async def create_source(source: SourceCreate):
    """Add a new source."""
    doc = source.model_dump()
    result = await db.upsert_source(doc)
    return {"status": "ok", "id": result}


@router.patch("/api/sources/{source_id}")
async def update_source(source_id: str, body: SourceUpdate):
    """Partially update a source (enabled toggle, category, etc.)."""
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if body.enabled is not None:
        updates["enabled"] = body.enabled
    ok = await db.update_source(source_id, updates)
    if not ok:
        raise HTTPException(status_code=404, detail="Source not found")
    return {"status": "ok"}


@router.delete("/api/sources")
async def remove_source(url: str = Query(...)):
    """Delete a source by URL."""
    deleted = await db.delete_source(url)
    if not deleted:
        raise HTTPException(status_code=404, detail="Source not found")
    return {"status": "deleted"}


# ──────────────────────────────────────────────────────────────
# Settings
# ──────────────────────────────────────────────────────────────

class SettingsUpdate(BaseModel):
    llm_enabled: Optional[bool] = None
    llm_filter_prompt: Optional[str] = None


@router.get("/api/settings")
async def get_settings():
    """Get application settings."""
    return await db.get_settings()


@router.put("/api/settings")
async def update_settings(body: SettingsUpdate):
    """Update application settings."""
    data = body.model_dump(exclude_none=True)
    for key, value in data.items():
        await db.set_setting(key, value)
    return await db.get_settings()


# ──────────────────────────────────────────────────────────────
# Interest tags (user-defined topic filters)
# ──────────────────────────────────────────────────────────────

class TagCreate(BaseModel):
    tag: str


@router.get("/api/tags")
async def list_interest_tags():
    """List all user-defined interest tags."""
    tags = await db.get_interest_tags()
    return {"items": tags}


@router.post("/api/tags")
async def create_interest_tag(body: TagCreate):
    """Add an interest tag."""
    tag = body.tag.strip()
    if not tag:
        raise HTTPException(status_code=400, detail="Tag cannot be empty")
    await db.add_interest_tag(tag)
    return {"status": "ok", "tag": tag}


@router.delete("/api/tags/{tag}")
async def remove_interest_tag(tag: str):
    """Remove an interest tag."""
    deleted = await db.delete_interest_tag(tag)
    if not deleted:
        raise HTTPException(status_code=404, detail="Tag not found")
    return {"status": "deleted"}


# ──────────────────────────────────────────────────────────────
# Keyword rules
# ──────────────────────────────────────────────────────────────

class RuleCreate(BaseModel):
    keyword: str
    field: str = "title"


@router.get("/api/rules")
async def list_keyword_rules():
    """List all keyword filter rules."""
    rules = await db.get_keyword_rules()
    return {"items": [_serialize_doc(r) for r in rules]}


@router.post("/api/rules")
async def create_keyword_rule(body: RuleCreate):
    """Add a keyword filter rule."""
    keyword = body.keyword.strip()
    if not keyword:
        raise HTTPException(status_code=400, detail="Keyword cannot be empty")
    rule_id = await db.add_keyword_rule(keyword, body.field)
    return {"status": "ok", "id": rule_id}


@router.patch("/api/rules/{rule_id}/toggle")
async def toggle_rule(rule_id: str):
    """Toggle a keyword rule on/off."""
    enabled = await db.toggle_keyword_rule(rule_id)
    return {"enabled": enabled}


@router.delete("/api/rules/{rule_id}")
async def remove_keyword_rule(rule_id: str):
    """Delete a keyword rule."""
    deleted = await db.delete_keyword_rule(rule_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"status": "deleted"}


# ──────────────────────────────────────────────────────────────
# Admin
# ──────────────────────────────────────────────────────────────

@router.post("/api/admin/run-pipeline")
async def run_pipeline():
    """Start the ingestion pipeline as a background task."""
    if _pipeline_state["running"]:
        return {"status": "already_running"}
    asyncio.create_task(_run_pipeline_bg())
    return {"status": "started"}


@router.get("/api/admin/pipeline-status")
async def pipeline_status():
    """Return current pipeline state: running flag, log lines, stats."""
    return {
        "running": _pipeline_state["running"],
        "logs": _pipeline_state["logs"],
        "stats": _pipeline_state["stats"],
    }


@router.get("/api/admin/pipeline-stream")
async def pipeline_stream():
    """SSE endpoint that emits log lines in real time."""
    q: asyncio.Queue = asyncio.Queue()
    _pipeline_state["queues"].add(q)

    async def event_gen():
        try:
            # Replay existing logs first
            for msg in list(_pipeline_state["logs"]):
                yield f"data: {msg}\n\n"
            # If not running, we're done
            if not _pipeline_state["running"]:
                yield "data: __DONE__\n\n"
                return
            # Stream new messages
            while True:
                try:
                    msg = await asyncio.wait_for(q.get(), timeout=30)
                    yield f"data: {msg}\n\n"
                    if msg.startswith("__DONE__") or msg.startswith("__ERROR__"):
                        break
                except asyncio.TimeoutError:
                    yield "data: __PING__\n\n"
                    if not _pipeline_state["running"]:
                        break
        finally:
            _pipeline_state["queues"].discard(q)

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


# ──────────────────────────────────────────────────────────────
# Pipeline run history
# ──────────────────────────────────────────────────────────────

@router.get("/api/admin/pipeline-runs")
async def list_pipeline_runs():
    """List all archived pipeline runs."""
    runs = await db.get_pipeline_runs(limit=100)
    return {"items": runs}


@router.delete("/api/admin/pipeline-runs/{run_id}")
async def delete_pipeline_run(run_id: str):
    """Delete a single pipeline run by id."""
    deleted = await db.delete_pipeline_run(run_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Run not found")
    return {"status": "deleted"}
