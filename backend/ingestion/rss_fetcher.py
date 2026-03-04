"""
RSS/Atom/JSON Feed 源解析模块 —— 获取 Feed 并输出标准化的文章存根。

功能:
- 异步 HTTP 获取 Feed 内容（XML 或 JSON）
- feedparser 解析 RSS 2.0 / Atom 格式
- JSON Feed 1.0/1.1 原生解析
- HTML 正文转换为干净的 Markdown
- 支持 fetch_since 日期过滤，跳过旧文章（无日期的条目默认放行）
"""

from __future__ import annotations

import json as _json
import logging
from datetime import datetime, timezone
from time import mktime
from typing import Any, Dict, List, Optional

import feedparser
import httpx
from markdownify import markdownify as md

from backend.ingestion.dedup import url_hash

logger = logging.getLogger(__name__)

# Timeout for HTTP requests (seconds)
_HTTP_TIMEOUT = 30


async def fetch_rss_feed(
    feed_url: str,
    source_id: Optional[str] = None,
    source_name: Optional[str] = None,
    fetch_since: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Fetch and parse an RSS/Atom/JSON Feed.

    Returns a list of article stub dicts ready for DB insertion.
    Each stub has: url, url_hash, source_id, source_name, raw_html,
    clean_markdown, fetched_at, status='pending'.

    Parameters
    ----------
    fetch_since : str, optional
        ISO date string (e.g. "2024-10-01") — articles with a published date
        **before** this threshold are skipped. Entries **without** a date are
        always included (we cannot determine they are old).
        None means accept all.
    """
    articles: List[Dict[str, Any]] = []

    # Parse fetch_since threshold
    fetch_since_dt: Optional[datetime] = None
    if fetch_since:
        try:
            fetch_since_dt = datetime.fromisoformat(fetch_since).replace(tzinfo=timezone.utc)
        except Exception:
            logger.warning("Invalid fetch_since value '%s', ignoring", fetch_since)

    try:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(feed_url, headers={"User-Agent": "AgentNews/1.0"})
            resp.raise_for_status()
            raw_body = resp.text
            content_type = resp.headers.get("content-type", "")
    except Exception as exc:
        logger.error(
            "Failed to fetch RSS feed %s: [%s] %s",
            feed_url,
            type(exc).__name__,
            exc,
            exc_info=True,
        )
        return articles

    # ── Detect format: JSON Feed vs RSS/Atom ──
    if _is_json_feed(raw_body, content_type):
        articles = _parse_json_feed(raw_body, source_id, source_name, fetch_since_dt)
        logger.info("Parsed %d entries (JSON Feed) from %s", len(articles), feed_url)
        return articles

    # ── RSS / Atom via feedparser ──
    feed = feedparser.parse(raw_body)
    if feed.bozo and not feed.entries:
        logger.warning("Malformed / empty feed: %s (bozo=%s)", feed_url, feed.bozo_exception)
        return articles

    for entry in feed.entries:
        link = entry.get("link", "").strip()
        if not link:
            continue

        # Build clean markdown from summary / content
        raw_html = ""
        if "content" in entry and entry.content:
            raw_html = entry.content[0].get("value", "")
        elif "summary" in entry:
            raw_html = entry.get("summary", "")

        clean_markdown = md(raw_html).strip() if raw_html else ""

        # Parse published date
        published_at = _parse_date(entry)

        # Apply fetch_since filter — only skip entries with a known date that
        # is before the threshold. Entries WITHOUT a date are always included
        # (we can't prove they are old).
        if fetch_since_dt is not None and published_at is not None:
            if published_at < fetch_since_dt:
                logger.debug("Skipping entry (before fetch_since %s): %s", fetch_since, link)
                continue

        articles.append({
            "url": link,
            "url_hash": url_hash(link),
            "source_id": source_id,
            "source_name": source_name or feed.feed.get("title", ""),
            "raw_html": raw_html,
            "clean_markdown": clean_markdown,
            "raw_title": entry.get("title", "").strip(),
            "status": "pending",
            "starred": False,
            "fetched_at": datetime.now(timezone.utc),
            "published_at": published_at,
            "analysis": None,
            "rejection_reason": "",
        })

    logger.info("Parsed %d entries from feed %s", len(articles), feed_url)
    return articles


# ──────────────────────────────────────────────────────────────
# JSON Feed 1.0/1.1 support  (https://jsonfeed.org/version/1.1)
# ──────────────────────────────────────────────────────────────

def _is_json_feed(body: str, content_type: str) -> bool:
    """Detect whether the response is a JSON Feed."""
    ct = content_type.lower()
    if "application/feed+json" in ct or "application/json" in ct:
        # Quick structural check
        stripped = body.lstrip()
        if stripped.startswith("{"):
            try:
                obj = _json.loads(body)
                return "items" in obj and (
                    "version" in obj
                    or "title" in obj
                )
            except Exception:
                return False
    # Also try detecting JSON even with wrong content-type
    stripped = body.lstrip()
    if stripped.startswith("{"):
        try:
            obj = _json.loads(body)
            version = obj.get("version", "")
            if isinstance(version, str) and "jsonfeed.org" in version:
                return True
        except Exception:
            pass
    return False


def _parse_json_feed(
    body: str,
    source_id: Optional[str],
    source_name: Optional[str],
    fetch_since_dt: Optional[datetime],
) -> List[Dict[str, Any]]:
    """Parse a JSON Feed 1.0/1.1 document into article stubs."""
    articles: List[Dict[str, Any]] = []
    try:
        data = _json.loads(body)
    except Exception as exc:
        logger.error("Failed to parse JSON Feed body: %s", exc)
        return articles

    feed_title = data.get("title", "")
    items = data.get("items", [])

    for item in items:
        url = (item.get("url") or item.get("external_url") or "").strip()
        if not url:
            continue

        # Content: prefer content_html, then content_text, then summary
        raw_html = item.get("content_html", "")
        content_text = item.get("content_text", "")
        summary_text = item.get("summary", "")
        if not raw_html and content_text:
            raw_html = f"<p>{content_text}</p>"
        clean_markdown = md(raw_html).strip() if raw_html else (content_text or summary_text)

        # Parse published date
        published_at = _parse_iso_date(item.get("date_published") or item.get("date_modified"))

        # Apply fetch_since filter — same lenient logic as RSS
        if fetch_since_dt is not None and published_at is not None:
            if published_at < fetch_since_dt:
                continue

        articles.append({
            "url": url,
            "url_hash": url_hash(url),
            "source_id": source_id,
            "source_name": source_name or feed_title,
            "raw_html": raw_html,
            "clean_markdown": clean_markdown,
            "raw_title": (item.get("title") or "").strip(),
            "status": "pending",
            "starred": False,
            "fetched_at": datetime.now(timezone.utc),
            "published_at": published_at,
            "analysis": None,
            "rejection_reason": "",
        })

    return articles


def _parse_iso_date(value: Optional[str]) -> Optional[datetime]:
    """Parse an ISO 8601 date string into a UTC datetime."""
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


# ──────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────

def _parse_date(entry: Any) -> Optional[datetime]:
    """Try to extract a published datetime from a feedparser entry."""
    for key in ("published_parsed", "updated_parsed"):
        tp = getattr(entry, key, None)
        if tp:
            try:
                return datetime.fromtimestamp(mktime(tp), tz=timezone.utc)
            except Exception:
                pass
    # Fallback: try ISO string fields
    for key in ("published", "updated"):
        raw = getattr(entry, key, None)
        if raw:
            dt = _parse_iso_date(raw)
            if dt:
                return dt
    return None
