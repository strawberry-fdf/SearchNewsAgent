"""
存储层 —— SQLite 异步实现 (aiosqlite)。

唯一的本地存储后端，无需外部数据库服务。
内部数据表:
  - sources:    信源配置表
  - articles:   文章主表（抓取+分析+筛选结果）
  - settings:   全局键值配置
  - interest_tags:  用户兴趣标签
  - keyword_rules:  关键词过滤规则
  - pipeline_runs:  Pipeline 执行历史
  - filter_presets: 筛选预设方案
  - llm_configs:   LLM 配置管理（多配置单激活）
"""

import aiosqlite
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.config import settings

logger = logging.getLogger(__name__)

# 数据库文件路径（相对于项目根目录），默认 backend/data/agent_news.db
DB_PATH: str = str(Path(__file__).resolve().parent.parent.parent / settings.SQLITE_DB_PATH)
# 自动创建数据目录
Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
_db_pool: Optional[aiosqlite.Connection] = None

# 自定义 JSON 编解码器，处理 SQLite TEXT 字段中存储的复杂类型 (datetime 等)
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
        tags TEXT, -- JSON list (LLM generated)
        status TEXT DEFAULT 'pending',
        rejection_reason TEXT,
        starred INTEGER DEFAULT 0,
        fetched_at TEXT,
        analyzed_at TEXT,
        published_at TEXT,
        analysis_json TEXT -- Full analysis JSON backup
    );
    """)
    await db.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    );
    """)
    await db.execute("""
    CREATE TABLE IF NOT EXISTS interest_tags (
        tag TEXT PRIMARY KEY,
        created_at TEXT
    );
    """)
    await db.execute("""
    CREATE TABLE IF NOT EXISTS keyword_rules (
        id TEXT PRIMARY KEY,
        keyword TEXT NOT NULL,
        field TEXT DEFAULT 'title',
        enabled INTEGER DEFAULT 1,
        created_at TEXT
    );
    """)
    await db.execute("""
    CREATE TABLE IF NOT EXISTS pipeline_runs (
        id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        logs TEXT DEFAULT '[]',
        stats TEXT DEFAULT '{}',
        status TEXT DEFAULT 'running'
    );
    """)
    await db.execute("""
    CREATE TABLE IF NOT EXISTS filter_presets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        prompt TEXT DEFAULT '',
        is_active INTEGER DEFAULT 0,
        created_at TEXT
    );
    """)
    await db.execute("""
    CREATE TABLE IF NOT EXISTS llm_configs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        model TEXT DEFAULT '',
        api_key TEXT DEFAULT '',
        base_url TEXT DEFAULT '',
        is_active INTEGER DEFAULT 0,
        created_at TEXT
    );
    """)

    # ── 迁移脚本: 向已有表加新字段 (失败即忽略，表示字段已存在) ──
    migration_stmts = [
        "ALTER TABLE sources ADD COLUMN category TEXT DEFAULT ''",
        "ALTER TABLE articles ADD COLUMN raw_title TEXT",
        "ALTER TABLE articles ADD COLUMN user_tags TEXT DEFAULT '[]'",
        "ALTER TABLE sources ADD COLUMN fetch_since TEXT DEFAULT NULL",
        "ALTER TABLE sources ADD COLUMN pinned INTEGER DEFAULT 0",
        "ALTER TABLE sources ADD COLUMN pin_order INTEGER DEFAULT 0",
    ]
    for stmt in migration_stmts:
        try:
            await db.execute(stmt)
        except Exception:
            pass  # Column already exists

    await db.commit()


# ──────────────────────────────────────────────────────────────
# 工具函数: SQLite Row → 字典，并自动解析 JSON 字段 / 布尔值
# ──────────────────────────────────────────────────────────────

def _row_to_dict(row: aiosqlite.Row) -> Dict[str, Any]:
    d = dict(row)
    # Parse JSON fields
    for k in ["tags", "user_tags"]:
        if k in d and d[k]:
            try:
                d[k] = json.loads(d[k])
            except:
                pass
        elif k in d and not d[k]:
            d[k] = []
    if "analysis_json" in d:
        if d["analysis_json"]:
            try:
                d["analysis_json"] = json.loads(d["analysis_json"])
            except:
                d["analysis_json"] = None
        else:
            d["analysis_json"] = None

    # Restore 'analysis' nested dict from analysis_json if present
    if "analysis_json" in d:
        d["analysis"] = d.pop("analysis_json")

    # Convert booleans
    for k in ["enabled", "model_selected", "starred", "pinned"]:
        if k in d:
            d[k] = bool(d[k])

    return d


# ──────────────────────────────────────────────────────────────
# 信源 (Source) 增删改查
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
                name=?, source_type=?, tags=?, enabled=?, fetch_interval_minutes=?, category=?, fetch_since=?
            WHERE id=?
        """, (
            doc.get("name"), doc.get("source_type"), tags_json,
            doc.get("enabled", True), doc.get("fetch_interval_minutes", 30),
            doc.get("category", ""),
            doc.get("fetch_since"),
            src_id
        ))
        await db.commit()
        return src_id
    else:
        src_id = str(uuid.uuid4())
        await db.execute("""
            INSERT INTO sources (id, url, name, source_type, tags, enabled, fetch_interval_minutes, category, fetch_since, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            src_id, url, doc.get("name"), doc.get("source_type"),
            tags_json, doc.get("enabled", True), doc.get("fetch_interval_minutes", 30),
            doc.get("category", ""),
            doc.get("fetch_since"),
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
    """删除信源，同时级联删除该信源下的所有文章。"""
    conn = await get_db()
    # 先查出信源名称，用于删除关联文章
    cursor = await conn.execute("SELECT name FROM sources WHERE url = ?", (url,))
    row = await cursor.fetchone()
    if not row:
        return False
    source_name = row[0]
    # 删除该信源下的所有文章
    await conn.execute("DELETE FROM articles WHERE source_name = ?", (source_name,))
    # 删除信源本身
    cursor = await conn.execute("DELETE FROM sources WHERE url = ?", (url,))
    await conn.commit()
    return cursor.rowcount > 0


# ──────────────────────────────────────────────────────────────
# 文章 (Article) 增删改查
# ──────────────────────────────────────────────────────────────

async def article_exists(url_hash: str) -> bool:
    db = await get_db()
    cursor = await db.execute("SELECT 1 FROM articles WHERE url_hash = ?", (url_hash,))
    return (await cursor.fetchone()) is not None


async def insert_article(doc: Dict[str, Any]) -> str:
    db = await get_db()
    art_id = str(uuid.uuid4())

    await db.execute("""
        INSERT INTO articles (
            id, url_hash, url, source_id, source_name,
            raw_html, clean_markdown, raw_title, status, rejection_reason,
            starred, fetched_at, published_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        art_id, doc["url_hash"], doc["url"], doc.get("source_id"), doc.get("source_name"),
        doc.get("raw_html"), doc.get("clean_markdown"), doc.get("raw_title"),
        doc.get("status", "pending"),
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


async def get_selected_articles(
    skip: int = 0,
    limit: int = 30,
    category: Optional[str] = None,
    tags: Optional[List[str]] = None,
    keyword: Optional[str] = None,
    sort_by: str = "fetched_at",
    sort_order: str = "desc",
    source_name: Optional[str] = None,
) -> List[Dict[str, Any]]:
    db = await get_db()
    sql = "SELECT * FROM articles WHERE status = 'selected'"
    params = []
    if source_name:
        sql += " AND source_name = ?"
        params.append(source_name)
    if category:
        sql += " AND category = ?"
        params.append(category)
    if tags:
        tag_clauses = []
        for tag in tags:
            tag_clauses.append("(tags LIKE ? OR user_tags LIKE ?)")
            params.extend([f'%"{tag}"%', f'%"{tag}"%'])
        sql += " AND (" + " OR ".join(tag_clauses) + ")"
    if keyword:
        sql += " AND (title LIKE ? OR raw_title LIKE ?)"
        params.extend([f"%{keyword}%", f"%{keyword}%"])
    _ALLOWED_SORT = {"fetched_at", "published_at", "importance", "ai_relevance", "analyzed_at"}
    _sort_col = sort_by if sort_by in _ALLOWED_SORT else "fetched_at"
    _sort_dir = "ASC" if sort_order.lower() == "asc" else "DESC"
    sql += f" ORDER BY {_sort_col} {_sort_dir} LIMIT ? OFFSET ?"
    params.extend([limit, skip])
    cursor = await db.execute(sql, tuple(params))
    rows = await cursor.fetchall()
    return [_row_to_dict(row) for row in rows]


async def count_selected_articles(
    category: Optional[str] = None,
    tags: Optional[List[str]] = None,
    keyword: Optional[str] = None,
    sort_by: str = "fetched_at",
    sort_order: str = "desc",
    source_name: Optional[str] = None,
) -> int:
    db = await get_db()
    sql = "SELECT COUNT(*) FROM articles WHERE status = 'selected'"
    params = []
    if source_name:
        sql += " AND source_name = ?"
        params.append(source_name)
    if category:
        sql += " AND category = ?"
        params.append(category)
    if tags:
        tag_clauses = []
        for tag in tags:
            tag_clauses.append("(tags LIKE ? OR user_tags LIKE ?)")
            params.extend([f'%"{tag}"%', f'%"{tag}"%'])
        sql += " AND (" + " OR ".join(tag_clauses) + ")"
    if keyword:
        sql += " AND (title LIKE ? OR raw_title LIKE ?)"
        params.extend([f"%{keyword}%", f"%{keyword}%"])
    cursor = await db.execute(sql, tuple(params))
    row = await cursor.fetchone()
    return row[0] if row else 0


async def get_all_articles(
    skip: int = 0,
    limit: int = 50,
    status: Optional[str] = None,
    keyword: Optional[str] = None,
    sort_by: str = "fetched_at",
    sort_order: str = "desc",
    source_name: Optional[str] = None,
) -> List[Dict[str, Any]]:
    db = await get_db()
    sql = "SELECT * FROM articles"
    params: List[Any] = []
    conditions: List[str] = []
    if source_name:
        conditions.append("source_name = ?")
        params.append(source_name)
    if status:
        conditions.append("status = ?")
        params.append(status)
    if keyword:
        conditions.append("(title LIKE ? OR raw_title LIKE ? OR summary LIKE ? OR clean_markdown LIKE ?)")
        kw = f"%{keyword}%"
        params.extend([kw, kw, kw, kw])
    if conditions:
        sql += " WHERE " + " AND ".join(conditions)
    _ALLOWED_SORT = {"fetched_at", "published_at", "importance", "ai_relevance", "analyzed_at"}
    _sort_col = sort_by if sort_by in _ALLOWED_SORT else "fetched_at"
    _sort_dir = "ASC" if sort_order.lower() == "asc" else "DESC"
    sql += f" ORDER BY {_sort_col} {_sort_dir} LIMIT ? OFFSET ?"
    params.extend([limit, skip])
    
    cursor = await db.execute(sql, tuple(params))
    rows = await cursor.fetchall()
    return [_row_to_dict(row) for row in rows]


async def count_articles(status: Optional[str] = None, keyword: Optional[str] = None, source_name: Optional[str] = None) -> int:
    db = await get_db()
    sql = "SELECT COUNT(*) FROM articles"
    params: List[Any] = []
    conditions: List[str] = []
    if source_name:
        conditions.append("source_name = ?")
        params.append(source_name)
    if status:
        conditions.append("status = ?")
        params.append(status)
    if keyword:
        conditions.append("(title LIKE ? OR raw_title LIKE ? OR summary LIKE ? OR clean_markdown LIKE ?)")
        kw = f"%{keyword}%"
        params.extend([kw, kw, kw, kw])
    if conditions:
        sql += " WHERE " + " AND ".join(conditions)
    
    cursor = await db.execute(sql, tuple(params))
    row = await cursor.fetchone()
    return row[0] if row else 0


async def get_source_article_counts(status: Optional[str] = None) -> List[Dict[str, Any]]:
    """获取每个信源的文章数量，可按状态过滤。返回 [{source_name, count}]，按数量降序。"""
    db = await get_db()
    sql = "SELECT source_name, COUNT(*) as cnt FROM articles"
    params: List[Any] = []
    if status:
        sql += " WHERE status = ?"
        params.append(status)
    sql += " GROUP BY source_name ORDER BY cnt DESC"
    cursor = await db.execute(sql, tuple(params))
    rows = await cursor.fetchall()
    return [{"source_name": row[0] or "未知信源", "count": row[1]} for row in rows]


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


# ──────────────────────────────────────────────────────────────
# 信源属性更新
# ──────────────────────────────────────────────────────────────

async def update_source(source_id: str, updates: Dict[str, Any]) -> bool:
    db = await get_db()
    allowed = {"enabled", "category", "name", "tags", "fetch_interval_minutes", "fetch_since", "pinned", "pin_order"}
    set_clauses = []
    params = []
    for k, v in updates.items():
        if k not in allowed:
            continue
        set_clauses.append(f"{k} = ?")
        if k == "tags" and isinstance(v, list):
            params.append(json.dumps(v))
        elif isinstance(v, bool):
            params.append(1 if v else 0)
        elif isinstance(v, datetime):
            params.append(v.isoformat())
        else:
            params.append(v)
    if not set_clauses:
        return False
    params.append(source_id)
    sql = f"UPDATE sources SET {', '.join(set_clauses)} WHERE id = ?"
    cursor = await db.execute(sql, tuple(params))
    await db.commit()
    return cursor.rowcount > 0


# ──────────────────────────────────────────────────────────────
# 全局配置 (Settings) 键值存储
# ──────────────────────────────────────────────────────────────

_SETTINGS_DEFAULTS: Dict[str, Any] = {
    "llm_enabled": True,
    "llm_filter_prompt": "",
    "pinned_categories": [],  # [{"name": "分类名", "order": int}]
}


async def get_settings() -> Dict[str, Any]:
    db = await get_db()
    cursor = await db.execute("SELECT key, value FROM settings")
    rows = await cursor.fetchall()
    result = dict(_SETTINGS_DEFAULTS)  # start with defaults
    for row in rows:
        try:
            result[row[0]] = json.loads(row[1])
        except Exception:
            result[row[0]] = row[1]
    return result


async def set_setting(key: str, value: Any) -> None:
    db = await get_db()
    await db.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        (key, json.dumps(value)),
    )
    await db.commit()


# ──────────────────────────────────────────────────────────────
# 用户兴趣标签 (Interest Tags)
# ──────────────────────────────────────────────────────────────

async def get_interest_tags() -> List[str]:
    db = await get_db()
    cursor = await db.execute("SELECT tag FROM interest_tags ORDER BY created_at")
    rows = await cursor.fetchall()
    return [row[0] for row in rows]


async def add_interest_tag(tag: str) -> None:
    db = await get_db()
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.execute(
        "INSERT OR IGNORE INTO interest_tags (tag, created_at) VALUES (?, ?)",
        (tag, now_iso),
    )
    await db.commit()


async def delete_interest_tag(tag: str) -> bool:
    db = await get_db()
    cursor = await db.execute("DELETE FROM interest_tags WHERE tag = ?", (tag,))
    await db.commit()
    return cursor.rowcount > 0


# ──────────────────────────────────────────────────────────────
# 关键词过滤规则 (Keyword Rules)
# ──────────────────────────────────────────────────────────────

async def get_keyword_rules() -> List[Dict[str, Any]]:
    db = await get_db()
    cursor = await db.execute("SELECT * FROM keyword_rules ORDER BY created_at")
    rows = await cursor.fetchall()
    return [_row_to_dict(row) for row in rows]


async def add_keyword_rule(keyword: str, field: str = "title") -> str:
    db = await get_db()
    rule_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.execute(
        "INSERT INTO keyword_rules (id, keyword, field, enabled, created_at) VALUES (?, ?, ?, 1, ?)",
        (rule_id, keyword, field, now_iso),
    )
    await db.commit()
    return rule_id


async def delete_keyword_rule(rule_id: str) -> bool:
    db = await get_db()
    cursor = await db.execute("DELETE FROM keyword_rules WHERE id = ?", (rule_id,))
    await db.commit()
    return cursor.rowcount > 0


async def toggle_keyword_rule(rule_id: str) -> bool:
    db = await get_db()
    cursor_fetch = await db.execute("SELECT enabled FROM keyword_rules WHERE id = ?", (rule_id,))
    row = await cursor_fetch.fetchone()
    if not row:
        return False
    new_val = 0 if row[0] else 1
    await db.execute("UPDATE keyword_rules SET enabled = ? WHERE id = ?", (new_val, rule_id))
    await db.commit()
    return bool(new_val)


# ──────────────────────────────────────────────────────────────
# 文章用户自定义标签 (User Tags)
# ──────────────────────────────────────────────────────────────

async def update_article_user_tags(url_hash: str, tags: List[str]) -> bool:
    db = await get_db()
    cursor = await db.execute(
        "UPDATE articles SET user_tags = ? WHERE url_hash = ?",
        (json.dumps(tags), url_hash),
    )
    await db.commit()
    return cursor.rowcount > 0


async def delete_article(url_hash: str) -> bool:
    db = await get_db()
    cursor = await db.execute("DELETE FROM articles WHERE url_hash = ?", (url_hash,))
    await db.commit()
    return cursor.rowcount > 0


async def delete_articles_batch(url_hashes: List[str]) -> int:
    db = await get_db()
    placeholders = ",".join(["?"] * len(url_hashes))
    cursor = await db.execute(
        f"DELETE FROM articles WHERE url_hash IN ({placeholders})", url_hashes
    )
    await db.commit()
    return cursor.rowcount


# ──────────────────────────────────────────────────────────────
# Pipeline 执行历史记录
# ──────────────────────────────────────────────────────────────

async def save_pipeline_run(
    run_id: str,
    started_at: str,
    finished_at: str,
    logs: List[str],
    stats: Dict[str, Any],
    status: str = "done",
) -> None:
    db = await get_db()
    await db.execute(
        """
        INSERT OR REPLACE INTO pipeline_runs (id, started_at, finished_at, logs, stats, status)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (run_id, started_at, finished_at, json.dumps(logs), json.dumps(stats), status),
    )
    await db.commit()


async def get_pipeline_runs(limit: int = 50) -> List[Dict[str, Any]]:
    db = await get_db()
    cursor = await db.execute(
        "SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT ?", (limit,)
    )
    rows = await cursor.fetchall()
    result = []
    for row in rows:
        d = dict(row)
        for k in ["logs", "stats"]:
            try:
                d[k] = json.loads(d[k]) if d[k] else ([] if k == "logs" else {})
            except Exception:
                d[k] = [] if k == "logs" else {}
        result.append(d)
    return result


async def delete_pipeline_run(run_id: str) -> bool:
    db = await get_db()
    cursor = await db.execute("DELETE FROM pipeline_runs WHERE id = ?", (run_id,))
    await db.commit()
    return cursor.rowcount > 0


# ──────────────────────────────────────────────────────────────
# 筛选预设方案 (Filter Presets)
# ──────────────────────────────────────────────────────────────

async def get_filter_presets() -> List[Dict[str, Any]]:
    db = await get_db()
    cursor = await db.execute("SELECT * FROM filter_presets ORDER BY created_at")
    rows = await cursor.fetchall()
    result = []
    for row in rows:
        d = dict(row)
        d["is_active"] = bool(d.get("is_active", 0))
        result.append(d)
    return result


async def create_filter_preset(name: str, prompt: str = "") -> str:
    db = await get_db()
    preset_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.execute(
        "INSERT INTO filter_presets (id, name, prompt, is_active, created_at) VALUES (?, ?, ?, 0, ?)",
        (preset_id, name, prompt, now_iso),
    )
    await db.commit()
    return preset_id


async def update_filter_preset(preset_id: str, updates: Dict[str, Any]) -> bool:
    db = await get_db()
    allowed = {"name", "prompt"}
    set_clauses = []
    params = []
    for k, v in updates.items():
        if k not in allowed:
            continue
        set_clauses.append(f"{k} = ?")
        params.append(v)
    if not set_clauses:
        return False
    params.append(preset_id)
    cursor = await db.execute(
        f"UPDATE filter_presets SET {', '.join(set_clauses)} WHERE id = ?",
        tuple(params),
    )
    await db.commit()
    return cursor.rowcount > 0


async def activate_filter_preset(preset_id: Optional[str]) -> None:
    """激活指定预设方案（同时停用其他所有方案）。传入 None 则全部停用。已废弃，保留向后兼容。"""
    db = await get_db()
    await db.execute("UPDATE filter_presets SET is_active = 0")
    if preset_id:
        await db.execute("UPDATE filter_presets SET is_active = 1 WHERE id = ?", (preset_id,))
    await db.commit()


async def toggle_filter_preset_active(preset_id: str) -> bool:
    """切换指定预设方案的激活状态（支持多选激活）。返回新的激活状态。"""
    db = await get_db()
    cursor = await db.execute("SELECT is_active FROM filter_presets WHERE id = ?", (preset_id,))
    row = await cursor.fetchone()
    if not row:
        return False
    new_state = 0 if row[0] else 1
    await db.execute("UPDATE filter_presets SET is_active = ? WHERE id = ?", (new_state, preset_id))
    await db.commit()
    return bool(new_state)


async def get_active_filter_preset() -> Optional[Dict[str, Any]]:
    """获取第一个激活的预设（向后兼容）。"""
    db = await get_db()
    cursor = await db.execute("SELECT * FROM filter_presets WHERE is_active = 1 LIMIT 1")
    row = await cursor.fetchone()
    if not row:
        return None
    d = dict(row)
    d["is_active"] = True
    return d


async def get_active_filter_presets() -> List[Dict[str, Any]]:
    """获取所有激活的预设方案列表（支持多选）。"""
    db = await get_db()
    cursor = await db.execute("SELECT * FROM filter_presets WHERE is_active = 1 ORDER BY created_at")
    rows = await cursor.fetchall()
    result = []
    for row in rows:
        d = dict(row)
        d["is_active"] = True
        result.append(d)
    return result


async def delete_filter_preset(preset_id: str) -> bool:
    db = await get_db()
    cursor = await db.execute("DELETE FROM filter_presets WHERE id = ?", (preset_id,))
    await db.commit()
    return cursor.rowcount > 0


# ──────────────────────────────────────────────────────────────
# LLM 配置管理 (LLM Configs) — 多配置单激活
# ──────────────────────────────────────────────────────────────

async def get_llm_configs() -> List[Dict[str, Any]]:
    """获取所有已保存的 LLM 配置。"""
    db = await get_db()
    cursor = await db.execute("SELECT * FROM llm_configs ORDER BY created_at")
    rows = await cursor.fetchall()
    result = []
    for row in rows:
        d = dict(row)
        d["is_active"] = bool(d.get("is_active", 0))
        result.append(d)
    return result


async def create_llm_config(name: str, model: str = "", api_key: str = "", base_url: str = "") -> str:
    """创建新的 LLM 配置，返回配置 ID。"""
    db = await get_db()
    config_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.execute(
        "INSERT INTO llm_configs (id, name, model, api_key, base_url, is_active, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)",
        (config_id, name, model, api_key, base_url, now_iso),
    )
    await db.commit()
    return config_id


async def update_llm_config(config_id: str, updates: Dict[str, Any]) -> bool:
    """更新指定 LLM 配置的字段。"""
    db = await get_db()
    allowed = {"name", "model", "api_key", "base_url"}
    set_clauses = []
    params = []
    for k, v in updates.items():
        if k not in allowed:
            continue
        set_clauses.append(f"{k} = ?")
        params.append(v)
    if not set_clauses:
        return False
    params.append(config_id)
    cursor = await db.execute(
        f"UPDATE llm_configs SET {', '.join(set_clauses)} WHERE id = ?",
        tuple(params),
    )
    await db.commit()
    return cursor.rowcount > 0


async def activate_llm_config(config_id: str) -> None:
    """激活指定 LLM 配置（同时停用其他所有配置，单选模式）。"""
    db = await get_db()
    await db.execute("UPDATE llm_configs SET is_active = 0")
    await db.execute("UPDATE llm_configs SET is_active = 1 WHERE id = ?", (config_id,))
    await db.commit()


async def deactivate_all_llm_configs() -> None:
    """停用所有 LLM 配置（回退到使用环境变量默认值）。"""
    db = await get_db()
    await db.execute("UPDATE llm_configs SET is_active = 0")
    await db.commit()


async def get_active_llm_config() -> Optional[Dict[str, Any]]:
    """获取当前激活的 LLM 配置，若无激活配置则返回 None。"""
    db = await get_db()
    cursor = await db.execute("SELECT * FROM llm_configs WHERE is_active = 1 LIMIT 1")
    row = await cursor.fetchone()
    if not row:
        return None
    d = dict(row)
    d["is_active"] = True
    return d


async def delete_llm_config(config_id: str) -> bool:
    """删除指定的 LLM 配置。"""
    db = await get_db()
    cursor = await db.execute("DELETE FROM llm_configs WHERE id = ?", (config_id,))
    await db.commit()
    return cursor.rowcount > 0


# ──────────────────────────────────────────────────────────────
# 文章缓存管理 (Cache Management)
# ──────────────────────────────────────────────────────────────

async def get_cache_stats() -> Dict[str, Any]:
    """获取数据库文件大小以及各信源的文章缓存占用估算。

    文章估算字节数包含所有主要文本字段:
      raw_html, clean_markdown, title, raw_title, summary, tags, user_tags, analysis_json

    返回结果中额外包含 other_bytes 表示非文章数据占用（表结构、索引、空闲页等）。

    Returns
    -------
    dict
        {
            "db_file_size_bytes": int,
            "total_articles": int,
            "article_total_bytes": int,
            "other_bytes": int,
            "sources": [
                {"source_name": str, "source_id": str | None, "article_count": int, "estimated_bytes": int},
                ...
            ],
        }
    """
    db_file = Path(DB_PATH)
    db_file_size = db_file.stat().st_size if db_file.exists() else 0

    # 检查是否存在 WAL 文件，加上其大小
    wal_file = Path(str(DB_PATH) + "-wal")
    if wal_file.exists():
        db_file_size += wal_file.stat().st_size

    conn = await get_db()
    # 总文章数
    cursor = await conn.execute("SELECT COUNT(*) FROM articles")
    row = await cursor.fetchone()
    total_articles: int = row[0] if row else 0

    # 每个信源的文章数量 + 所有主要文本字段的总长度估算
    cursor = await conn.execute("""
        SELECT
            source_name,
            source_id,
            COUNT(*) AS cnt,
            COALESCE(SUM(LENGTH(raw_html)), 0)
            + COALESCE(SUM(LENGTH(clean_markdown)), 0)
            + COALESCE(SUM(LENGTH(title)), 0)
            + COALESCE(SUM(LENGTH(raw_title)), 0)
            + COALESCE(SUM(LENGTH(summary)), 0)
            + COALESCE(SUM(LENGTH(tags)), 0)
            + COALESCE(SUM(LENGTH(user_tags)), 0)
            + COALESCE(SUM(LENGTH(analysis_json)), 0)
            + COALESCE(SUM(LENGTH(url)), 0)
            AS content_bytes
        FROM articles
        GROUP BY source_name
        ORDER BY content_bytes DESC
    """)
    rows = await cursor.fetchall()
    sources = [
        {
            "source_name": r[0] or "未知信源",
            "source_id": r[1],
            "article_count": r[2],
            "estimated_bytes": r[3],
        }
        for r in rows
    ]

    article_total_bytes = sum(s["estimated_bytes"] for s in sources)
    other_bytes = max(0, db_file_size - article_total_bytes)

    return {
        "db_file_size_bytes": db_file_size,
        "total_articles": total_articles,
        "article_total_bytes": article_total_bytes,
        "other_bytes": other_bytes,
        "sources": sources,
    }


async def clear_article_cache(source_ids: Optional[List[str]] = None) -> int:
    """清除文章缓存数据。

    Parameters
    ----------
    source_ids : list of str, optional
        要清除的信源 ID 列表。若为 None 或空列表则清除全部文章。

    Returns
    -------
    int
        被删除的文章条数。
    """
    conn = await get_db()
    if source_ids:
        placeholders = ",".join(["?"] * len(source_ids))
        cursor = await conn.execute(
            f"DELETE FROM articles WHERE source_id IN ({placeholders})",
            source_ids,
        )
    else:
        cursor = await conn.execute("DELETE FROM articles")
    await conn.commit()
    deleted = cursor.rowcount

    # VACUUM 回收磁盘空间
    try:
        await conn.execute("VACUUM")
    except Exception:
        pass  # VACUUM 在 WAL 模式或事务中可能失败，忽略即可

    return deleted
