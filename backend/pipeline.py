"""
Pipeline orchestrator – full flow from ingestion → LLM → rules → storage → notification.
Called by the scheduler or manually via CLI.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List

from backend.config import settings
from backend.ingestion.dedup import url_hash
from backend.ingestion.rss_fetcher import fetch_rss_feed
from backend.ingestion.web_scraper import scrape_web_page
from backend.llm.extractor import analyse_article
from backend.notification.feishu import send_feishu_notification
from backend.rules.engine import evaluate_article
from backend.storage import db as mongo

logger = logging.getLogger(__name__)


async def run_ingestion_pipeline() -> Dict[str, int]:
    """
    Execute the full pipeline:
      1. Fetch all enabled sources
      2. Collect new articles (skip duplicates)
      3. Run LLM analysis on pending articles
      4. Apply rules engine
      5. Send notifications for selected articles

    Returns a summary dict with counts.
    """
    stats = {"fetched": 0, "duplicates": 0, "analysed": 0, "selected": 0, "rejected": 0, "errors": 0}

    # ── Step 1: Fetch sources ──
    sources = await mongo.get_all_sources(enabled_only=True)
    if not sources:
        logger.warning("No enabled sources configured. Add sources via API or seed script.")
        return stats

    logger.info("Starting ingestion pipeline with %d sources...", len(sources))

    # ── Step 2: Collect articles from each source ──
    for source in sources:
        source_type = source.get("source_type", "rss")
        source_url = source["url"]
        # SQLite uses 'id', MongoDB uses '_id'
        source_id = str(source.get("id") or source.get("_id") or "")
        source_name = source.get("name", "")
        source_tags = source.get("tags") or []  # Ensure list

        try:
            if source_type == "rss":
                articles = await fetch_rss_feed(source_url, source_id, source_name)
            elif source_type == "web":
                articles = await scrape_web_page(source_url, source_id, source_name)
            else:
                logger.warning("Unsupported source type: %s for %s", source_type, source_url)
                continue

            # Insert new articles (dedup by url_hash)
            for article in articles:
                h = article["url_hash"]
                if await mongo.article_exists(h):
                    stats["duplicates"] += 1
                    continue

                await mongo.insert_article(article)
                stats["fetched"] += 1

            # Update last fetch timestamp
            await mongo.update_source_last_fetched(source_url)

        except Exception as exc:
            logger.error("Error fetching source %s: %s", source_url, exc, exc_info=True)
            stats["errors"] += 1

    logger.info("Ingestion complete: %d new, %d duplicates", stats["fetched"], stats["duplicates"])

    # ── Step 3 & 4: Analyse pending articles ──
    pending = await mongo.get_pending_articles(limit=100)
    logger.info("Analysing %d pending articles...", len(pending))

    for doc in pending:
        content = doc.get("clean_markdown") or doc.get("raw_html", "")
        h = doc["url_hash"]

        if not content.strip():
            logger.warning("Skipping article with empty content: %s", doc.get("url"))
            await mongo.update_article(h, {
                "status": "rejected",
                "rejection_reason": "REJECTED_EMPTY_CONTENT",
                "analyzed_at": datetime.now(timezone.utc),
            })
            stats["rejected"] += 1
            continue

        # ── LLM analysis ──
        analysis = await analyse_article(content)
        if analysis is None:
            logger.warning("LLM analysis failed for %s, sending to dead letter", doc.get("url"))
            await mongo.update_article(h, {
                "status": "rejected",
                "rejection_reason": "REJECTED_LLM_FAILURE",
                "analyzed_at": datetime.now(timezone.utc),
            })
            stats["errors"] += 1
            continue

        stats["analysed"] += 1
        analysis_dict = analysis.model_dump()

        # ── Rules engine ──
        # Look up source tags for VIP whitelist logic
        source_id = doc.get("source_id")
        source_tags = []
        if source_id:
            all_sources = await mongo.get_all_sources(enabled_only=False)
            for s in all_sources:
                s_id = str(s.get("id") or s.get("_id") or "")
                if s_id == source_id:
                    source_tags = s.get("tags") or []
                    break

        status, reason = evaluate_article(analysis_dict, source_tags)

        # ── Update article ──
        await mongo.update_article(h, {
            "analysis": analysis_dict,
            "status": status,
            "rejection_reason": reason,
            "analyzed_at": datetime.now(timezone.utc),
        })

        if status == "selected":
            stats["selected"] += 1
            # ── Notification ──
            try:
                await send_feishu_notification(
                    title=analysis.title,
                    importance=analysis.importance,
                    category=analysis.category,
                    summary=analysis.summary,
                    url=doc.get("url", ""),
                    tags=analysis.tags,
                )
            except Exception as exc:
                logger.error("Notification failed for %s: %s", doc.get("url"), exc)
        else:
            stats["rejected"] += 1

    logger.info(
        "Pipeline complete: fetched=%d, analysed=%d, selected=%d, rejected=%d, errors=%d",
        stats["fetched"], stats["analysed"], stats["selected"], stats["rejected"], stats["errors"],
    )
    return stats
