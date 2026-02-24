"""
RSS feed fetcher – parses RSS / Atom feeds and yields normalised article stubs.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import feedparser
import httpx
from markdownify import markdownify as md

from backend.ingestion.dedup import url_hash

logger = logging.getLogger(__name__)

# Maximum number of entries to process per feed per poll
_MAX_ENTRIES_PER_FEED = 30

# Timeout for HTTP requests (seconds)
_HTTP_TIMEOUT = 30


async def fetch_rss_feed(
    feed_url: str,
    source_id: Optional[str] = None,
    source_name: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Fetch and parse an RSS/Atom feed.

    Returns a list of article stub dicts ready for insertion into MongoDB.
    Each stub has: url, url_hash, source_id, source_name, raw_html,
    clean_markdown, fetched_at, status='pending'.
    """
    articles: List[Dict[str, Any]] = []

    try:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(feed_url, headers={"User-Agent": "AgentNews/1.0"})
            resp.raise_for_status()
            raw_xml = resp.text
    except Exception as exc:
        logger.error(
            "Failed to fetch RSS feed %s: [%s] %s",
            feed_url,
            type(exc).__name__,
            exc,
            exc_info=True,
        )
        return articles

    feed = feedparser.parse(raw_xml)
    if feed.bozo and not feed.entries:
        logger.warning("Malformed / empty feed: %s (bozo=%s)", feed_url, feed.bozo_exception)
        return articles

    for entry in feed.entries[:_MAX_ENTRIES_PER_FEED]:
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


def _parse_date(entry: Any) -> Optional[datetime]:
    """Try to extract a published datetime from a feed entry."""
    for key in ("published_parsed", "updated_parsed"):
        tp = getattr(entry, key, None)
        if tp:
            try:
                from time import mktime
                return datetime.fromtimestamp(mktime(tp), tz=timezone.utc)
            except Exception:
                pass
    return None
