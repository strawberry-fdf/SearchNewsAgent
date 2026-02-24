"""
Storage Layer - SQLite (Async) Implementation.
Replaces MongoDB for standalone portability.
"""

import aiosqlite
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

DB_PATH = "agent_news.db"
_db_pool: Optional[aiosqlite.Connection] = None

# Custom JSON encoder/decoder for complex types stored in TEXT columns
def _json_dumps(obj: Any) -> str:
    if isinstance(obj, (datetime,)):
        return obj.isoformat()
    return json.dumps(obj, default=str)

def _json_loads(text: str) -> Any:
    if not text:
        return None
    try:
        return json.loads(text)
    except Exception:
        return text


async def get_db() -> aiosqlite.Connection:
    global _db_pool
    if _db_pool is None:
        _db_pool = await aiosqlite.connect(DB_PATH)
        _db_pool.row_factory = aiosqlite.Row
        await _init_schema(_db_pool)
        logger.info(f"Connected to SQLite: {DB_PATH}")
    return _db_pool


async def close_db():
    global _db_pool
    if _db_pool:
        await _db_pool.close()
        _db_pool = None
        logger.info("SQLite connection closed.")


async def _init_schema(db: aiosqlite.Connection):
    await db.execute("""
    CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY,
        url TEXT UNIQUE,
        name TEXT,
        source_type TEXT,
        tags TEXT, -- JSON list
        enabled INTEGER DEFAULT 1,
        fetch_interval_minutes INTEGER DEFAULT 30,
        last_fetched_at TEXT,
        created_at TEXT
    );
    """)
    await db.execute("""
    CREATE TABLE IF NOT EXISTS articles (
        id TEXT PRIMARY KEY,
        url_hash TEXT UNIQUE,
        url TEXT,
        source_id TEXT,
        source_name TEXT,
        raw_html TEXT,
        clean_markdown TEXT,
        title TEXT,
        summary TEXT,
        category TEXT,
        ai_relevance INTEGER,
        importance INTEGER,
        model_selected INTEGER DEFAULT 0,
        tags TEXT, -- JSON list
        status TEXT DEFAULT 'pending',
        rejection_reason TEXT,
        starred INTEGER DEFAULT 0,
        fetched_at TEXT,
        analyzed_at TEXT,
        published_at TEXT,
        analysis_json TEXT -- Full analysis JSON backup
    );
    """)
    await db.commit()


# ──────────────────────────────────────────────────────────────
# Helper: Convert Row to Dict
# ──────────────────────────────────────────────────────────────

def _row_to_dict(row: aiosqlite.Row) -> Dict[str, Any]:
    d = dict(row)
    # Parse JSON fields
    for k in ["tags", "analysis_json"]:
        if k in d and d[k]:
            try:
                d[k] = json.loads(d[k])
            except:
                pass
    
    # Restore 'analysis' nested dict from analysis_json if present
    if "analysis_json" in d:
        d["analysis"] = d.pop("analysis_json")
    
    # Convert booleans
    for k in ["enabled", "model_selected", "starred"]:
        if k in d:
            d[k] = bool(d[k])

    return d


# ──────────────────────────────────────────────────────────────
# Source CRUD
# ──────────────────────────────────────────────────────────────

async def upsert_source(doc: Dict[str, Any]) -> str:
    db = await get_db()
    
    # Check if exists
    url = doc["url"]
    existing = await db.execute("SELECT id FROM sources WHERE url = ?", (url,))
    row = await existing.fetchone()
    
    now_iso = datetime.now(timezone.utc).isoformat()
    tags_json = json.dumps(doc.get("tags", []))
    
    if row:
        src_id = row[0]
        await db.execute("""
            UPDATE sources SET 
                name=?, source_type=?, tags=?, enabled=?, fetch_interval_minutes=?
            WHERE id=?
        """, (
            doc.get("name"), doc.get("source_type"), tags_json, 
            doc.get("enabled", True), doc.get("fetch_interval_minutes", 30),
            src_id
        ))
        await db.commit()
        return src_id
    else:
        src_id = str(uuid.uuid4())
        await db.execute("""
            INSERT INTO sources (id, url, name, source_type, tags, enabled, fetch_interval_minutes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            src_id, url, doc.get("name"), doc.get("source_type"), 
            tags_json, doc.get("enabled", True), doc.get("fetch_interval_minutes", 30),
            now_iso
        ))
        await db.commit()
        return src_id


async def get_all_sources(enabled_only: bool = True) -> List[Dict[str, Any]]:
    db = await get_db()
    query = "SELECT * FROM sources"
    if enabled_only:
        query += " WHERE enabled = 1"
    
    cursor = await db.execute(query)
    rows = await cursor.fetchall()
    return [_row_to_dict(row) for row in rows]


async def update_source_last_fetched(url: str):
    db = await get_db()
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.execute("UPDATE sources SET last_fetched_at = ? WHERE url = ?", (now_iso, url))
    await db.commit()


async def delete_source(url: str) -> bool:
    db = await get_db()
    cursor = await db.execute("DELETE FROM sources WHERE url = ?", (url,))
    await db.commit()
    return cursor.rowcount > 0


# ──────────────────────────────────────────────────────────────
# Article CRUD
# ──────────────────────────────────────────────────────────────

async def article_exists(url_hash: str) -> bool:
    db = await get_db()
    cursor = await db.execute("SELECT 1 FROM articles WHERE url_hash = ?", (url_hash,))
    return (await cursor.fetchone()) is not None


async def insert_article(doc: Dict[str, Any]) -> str:
    db = await get_db()
    art_id = str(uuid.uuid4())
    
    # Flatten analysis fields if present (usually None on insert)
    analysis = doc.get("analysis", {}) or {}
    
    await db.execute("""
        INSERT INTO articles (
            id, url_hash, url, source_id, source_name, 
            raw_html, clean_markdown, status, rejection_reason, 
            starred, fetched_at, published_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        art_id, doc["url_hash"], doc["url"], doc.get("source_id"), doc.get("source_name"),
        doc.get("raw_html"), doc.get("clean_markdown"), doc.get("status", "pending"),
        doc.get("rejection_reason"), doc.get("starred", False),
        doc.get("fetched_at", datetime.now(timezone.utc)).isoformat(),
        doc.get("published_at").isoformat() if doc.get("published_at") else None
    ))
    await db.commit()
    return art_id


async def update_article(url_hash: str, update_fields: Dict[str, Any]) -> bool:
    db = await get_db()
    
    # Construct update query dynamically
    set_clauses = []
    params = []
    
    # Handle nested 'analysis' dict updates -> flatten to columns
    if "analysis" in update_fields:
        analysis = update_fields.pop("analysis")
        update_fields["analysis_json"] = json.dumps(analysis) # Backup full JSON
        # Update columns
        for k in ["title", "summary", "category", "ai_relevance", "importance", "model_selected"]:
            if k in analysis:
                update_fields[k] = analysis[k]
        if "tags" in analysis:
            update_fields["tags"] = json.dumps(analysis["tags"])

    for k, v in update_fields.items():
        set_clauses.append(f"{k} = ?")
        if isinstance(v, (datetime,)):
            params.append(v.isoformat())
        elif isinstance(v, bool):
            params.append(1 if v else 0)
        else:
            params.append(v)
            
    params.append(url_hash)
    
    sql = f"UPDATE articles SET {', '.join(set_clauses)} WHERE url_hash = ?"
    cursor = await db.execute(sql, tuple(params))
    await db.commit()
    return cursor.rowcount > 0


async def get_pending_articles(limit: int = 50) -> List[Dict[str, Any]]:
    db = await get_db()
    cursor = await db.execute(
        "SELECT * FROM articles WHERE status = 'pending' ORDER BY fetched_at DESC LIMIT ?", 
        (limit,)
    )
    rows = await cursor.fetchall()
    return [_row_to_dict(row) for row in rows]


async def get_selected_articles(skip: int = 0, limit: int = 30, category: Optional[str] = None) -> List[Dict[str, Any]]:
    db = await get_db()
    sql = "SELECT * FROM articles WHERE status = 'selected'"
    params = []
    if category:
        sql += " AND category = ?"
        params.append(category)
    
    sql += " ORDER BY fetched_at DESC LIMIT ? OFFSET ?"
    params.extend([limit, skip])
    
    cursor = await db.execute(sql, tuple(params))
    rows = await cursor.fetchall()
    return [_row_to_dict(row) for row in rows]


async def get_all_articles(skip: int = 0, limit: int = 50, status: Optional[str] = None) -> List[Dict[str, Any]]:
    db = await get_db()
    sql = "SELECT * FROM articles"
    params = []
    if status:
        sql += " WHERE status = ?"
        params.append(status)
        
    sql += " ORDER BY fetched_at DESC LIMIT ? OFFSET ?"
    params.extend([limit, skip])
    
    cursor = await db.execute(sql, tuple(params))
    rows = await cursor.fetchall()
    return [_row_to_dict(row) for row in rows]


async def count_articles(status: Optional[str] = None) -> int:
    db = await get_db()
    sql = "SELECT COUNT(*) FROM articles"
    params = []
    if status:
        sql += " WHERE status = ?"
        params.append(status)
    
    cursor = await db.execute(sql, tuple(params))
    row = await cursor.fetchone()
    return row[0] if row else 0


async def toggle_star(url_hash: str) -> bool:
    db = await get_db()
    # Get current state
    cursor = await db.execute("SELECT starred FROM articles WHERE url_hash = ?", (url_hash,))
    row = await cursor.fetchone()
    if not row:
        return False
        
    new_state = not bool(row[0])
    await db.execute("UPDATE articles SET starred = ? WHERE url_hash = ?", (1 if new_state else 0, url_hash))
    await db.commit()
    return new_state
