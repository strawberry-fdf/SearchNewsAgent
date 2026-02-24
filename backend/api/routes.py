"""
FastAPI routes – REST API for the frontend and admin operations.
"""

from typing import Any, Dict, List, Optional
import logging

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from backend.storage import db

logger = logging.getLogger(__name__)

router = APIRouter()


# ──────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────

def _serialize_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Convert DB document to JSON-safe dict."""
    # SQLite uses 'id', MongoDB uses '_id'
    if "_id" in doc:
        doc["id"] = str(doc.pop("_id"))
    
    # Convert datetime objects to ISO strings
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
    status: Optional[str] = Query(None, description="Filter by status: selected, rejected, pending"),
    category: Optional[str] = Query(None, description="Filter by category"),
    skip: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=100),
):
    """List articles with optional filters."""
    if status == "selected" and category:
        docs = await db.get_selected_articles(skip=skip, limit=limit, category=category)
    elif status == "selected":
        docs = await db.get_selected_articles(skip=skip, limit=limit)
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
    skip: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=100),
):
    """Convenience endpoint for the frontend feed – only selected articles."""
    docs = await db.get_selected_articles(skip=skip, limit=limit, category=category)
    total = await db.count_articles(status="selected")
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


@router.delete("/api/sources")
async def remove_source(url: str = Query(...)):
    """Delete a source by URL."""
    deleted = await db.delete_source(url)
    if not deleted:
        raise HTTPException(status_code=404, detail="Source not found")
    return {"status": "deleted"}
