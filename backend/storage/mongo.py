"""
MongoDB storage layer – async CRUD operations for articles and sources.
Uses Motor (async MongoDB driver) for non-blocking I/O.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo import DESCENDING, IndexModel

from backend.config import settings

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────
# Singleton client / db reference
# ──────────────────────────────────────────────────────────────

_client: Optional[AsyncIOMotorClient] = None
_db: Optional[AsyncIOMotorDatabase] = None


async def get_db() -> AsyncIOMotorDatabase:
    """Return (and lazily initialise) the database handle."""
    global _client, _db
    if _db is None:
        _client = AsyncIOMotorClient(settings.MONGO_URI)
        _db = _client[settings.MONGO_DB_NAME]
        await _ensure_indexes(_db)
        logger.info("Connected to MongoDB: %s / %s", settings.MONGO_URI, settings.MONGO_DB_NAME)
    return _db


async def close_db() -> None:
    global _client, _db
    if _client:
        _client.close()
        _client = None
        _db = None
        logger.info("MongoDB connection closed.")


# ──────────────────────────────────────────────────────────────
# Index setup
# ──────────────────────────────────────────────────────────────

async def _ensure_indexes(db: AsyncIOMotorDatabase) -> None:
    """Create necessary indexes on first connect."""
    articles = db["articles"]
    await articles.create_indexes([
        IndexModel([("url_hash", 1)], unique=True, name="idx_url_hash_unique"),
        IndexModel([("status", 1), ("fetched_at", DESCENDING)], name="idx_status_fetched"),
        IndexModel([("fetched_at", DESCENDING)], name="idx_fetched_desc"),
        IndexModel([("analysis.category", 1)], name="idx_category"),
    ])

    sources = db["sources"]
    await sources.create_indexes([
        IndexModel([("url", 1)], unique=True, name="idx_source_url_unique"),
    ])
    logger.info("MongoDB indexes ensured.")


# ──────────────────────────────────────────────────────────────
# Article CRUD
# ──────────────────────────────────────────────────────────────

async def article_exists(url_hash: str) -> bool:
    """Check if an article with the given url_hash already exists (dedup)."""
    db = await get_db()
    return await db["articles"].find_one({"url_hash": url_hash}, {"_id": 1}) is not None


async def insert_article(doc: Dict[str, Any]) -> str:
    """Insert a new article document. Returns the inserted _id as string."""
    db = await get_db()
    result = await db["articles"].insert_one(doc)
    return str(result.inserted_id)


async def update_article(url_hash: str, update_fields: Dict[str, Any]) -> bool:
    """Update an existing article by url_hash."""
    db = await get_db()
    result = await db["articles"].update_one(
        {"url_hash": url_hash},
        {"$set": update_fields},
    )
    return result.modified_count > 0


async def get_pending_articles(limit: int = 50) -> List[Dict[str, Any]]:
    """Return articles that haven't been analysed yet."""
    db = await get_db()
    cursor = db["articles"].find(
        {"status": "pending"},
    ).sort("fetched_at", DESCENDING).limit(limit)
    return await cursor.to_list(length=limit)


async def get_selected_articles(
    skip: int = 0,
    limit: int = 30,
    category: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Return selected (精选) articles for the frontend feed."""
    db = await get_db()
    query: Dict[str, Any] = {"status": "selected"}
    if category:
        query["analysis.category"] = category
    cursor = (
        db["articles"]
        .find(query)
        .sort("fetched_at", DESCENDING)
        .skip(skip)
        .limit(limit)
    )
    return await cursor.to_list(length=limit)


async def get_all_articles(
    skip: int = 0,
    limit: int = 50,
    status: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Return all articles with optional status filter."""
    db = await get_db()
    query: Dict[str, Any] = {}
    if status:
        query["status"] = status
    cursor = (
        db["articles"]
        .find(query)
        .sort("fetched_at", DESCENDING)
        .skip(skip)
        .limit(limit)
    )
    return await cursor.to_list(length=limit)


async def count_articles(status: Optional[str] = None) -> int:
    db = await get_db()
    query: Dict[str, Any] = {}
    if status:
        query["status"] = status
    return await db["articles"].count_documents(query)


async def toggle_star(url_hash: str) -> bool:
    """Toggle the starred state of an article. Returns new starred state."""
    db = await get_db()
    doc = await db["articles"].find_one({"url_hash": url_hash}, {"starred": 1})
    if not doc:
        return False
    new_state = not doc.get("starred", False)
    await db["articles"].update_one(
        {"url_hash": url_hash},
        {"$set": {"starred": new_state}},
    )
    return new_state


# ──────────────────────────────────────────────────────────────
# Source CRUD
# ──────────────────────────────────────────────────────────────

async def upsert_source(doc: Dict[str, Any]) -> str:
    """Insert or update a source by URL."""
    db = await get_db()
    result = await db["sources"].update_one(
        {"url": doc["url"]},
        {"$set": doc, "$setOnInsert": {"created_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    return str(result.upserted_id or "updated")


async def get_all_sources(enabled_only: bool = True) -> List[Dict[str, Any]]:
    """Return all sources, optionally filtered to enabled ones."""
    db = await get_db()
    query: Dict[str, Any] = {}
    if enabled_only:
        query["enabled"] = True
    cursor = db["sources"].find(query)
    return await cursor.to_list(length=500)


async def update_source_last_fetched(source_url: str) -> None:
    """Set the last_fetched_at timestamp for a source."""
    db = await get_db()
    await db["sources"].update_one(
        {"url": source_url},
        {"$set": {"last_fetched_at": datetime.now(timezone.utc)}},
    )


async def delete_source(source_url: str) -> bool:
    db = await get_db()
    result = await db["sources"].delete_one({"url": source_url})
    return result.deleted_count > 0
