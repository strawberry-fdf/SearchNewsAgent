"""
流水线编排模块 —— 端到端全流程：采集 → LLM 分析 → 规则过滤 → 入库 → 通知推送。

这是系统的核心编排器，由定时调度器或管理员手动触发。

流程步骤:
  Step 1: 遍历所有启用的信源，通过 RSS/Web 抓取新文章
  Step 2: URL 哈希去重，新文章写入数据库（status=pending）
  Step 3: 对 pending 文章调用 LLM 进行结构化分析
  Step 4: 将 LLM 分析结果送入规则引擎四步漏斗过滤
  Step 5: 入选文章触发飞书推送通知
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

from backend.config import settings
from backend.ingestion.dedup import url_hash
from backend.ingestion.rss_fetcher import fetch_rss_feed
from backend.ingestion.web_scraper import scrape_web_page
from backend.llm.extractor import analyse_article
from backend.notification.feishu import send_feishu_notification
from backend.rules.engine import evaluate_article
from backend.storage import db

logger = logging.getLogger(__name__)


async def run_ingestion_pipeline(
    progress_cb: Optional[Callable[[str], None]] = None,
    filter_prompt: str = "",
) -> Dict[str, int]:
    """
    执行完整采集流水线。

    Parameters
    ----------
    progress_cb : callable, optional
        进度回调函数，在关键步骤会被调用，传入日志消息字符串。
        前端 SSE 流式日志就是基于此回调实现的。
    filter_prompt : str
        可选的用户自定义筛选要求，会追加到 LLM System Prompt 中。

    Returns
    -------
    dict
        统计数据: {fetched, duplicates, analysed, selected, rejected, errors}
    """

    def emit(msg: str):
        logger.info(msg)
        if progress_cb:
            progress_cb(msg)

    stats = {"fetched": 0, "duplicates": 0, "analysed": 0, "selected": 0, "rejected": 0, "errors": 0}

    # ── Step 1: 获取所有启用的信源列表 ──
    sources = await db.get_all_sources(enabled_only=True)
    if not sources:
        emit("⚠️ 没有启用的信源，请先添加信源")
        return stats

    emit(f"🚀 开始采集，共 {len(sources)} 个信源")

    # ── Step 2: 遍历信源，抓取新文章并去重入库 ──
    for source in sources:
        source_type = source.get("source_type", "rss")
        source_url = source["url"]
        source_id = str(source.get("id", ""))
        source_name = source.get("name", "")
        source_tags = source.get("tags") or []

        try:
            emit(f"📡 正在抓取: {source_name}")
            fetch_since_str = source.get("fetch_since")  # e.g. "2024-10-01" or None
            if source_type == "rss":
                articles = await fetch_rss_feed(source_url, source_id, source_name, fetch_since=fetch_since_str)
            elif source_type == "web":
                articles = await scrape_web_page(source_url, source_id, source_name)
            else:
                emit(f"⚠️ 不支持的信源类型: {source_type}")
                continue

            new_count = 0
            dup_count = 0
            for article in articles:
                h = article["url_hash"]
                if await db.article_exists(h):
                    dup_count += 1
                    stats["duplicates"] += 1
                    continue
                await db.insert_article(article)
                stats["fetched"] += 1
                new_count += 1

            await db.update_source_last_fetched(source_url)
            emit(f"   ✅ {source_name}: 新增 {new_count} 篇，重复 {dup_count} 篇")

        except Exception as exc:
            emit(f"   ❌ 抓取失败 {source_name}: {exc}")
            logger.error("Error fetching source %s: %s", source_url, exc, exc_info=True)
            stats["errors"] += 1

    emit(f"📥 抓取完成: 新增 {stats['fetched']} 篇，重复 {stats['duplicates']} 篇")

    # ── Step 3 & 4: LLM 分析 + 规则引擎过滤 ──
    pending = await db.get_pending_articles(limit=100)
    emit(f"🤖 待分析文章: {len(pending)} 篇")

    app_settings = await db.get_settings()
    llm_enabled: bool = app_settings.get("llm_enabled", True)
    # Use per-run filter_prompt if provided, else fall back to setting
    active_filter_prompt = filter_prompt or app_settings.get("llm_filter_prompt", "")

    if not llm_enabled:
        emit("⚡ LLM 已关闭 – 全部文章直接入选")
        for doc in pending:
            raw_title = doc.get("raw_title") or doc.get("title") or doc.get("url", "")
            await db.update_article(doc["url_hash"], {
                "status": "selected",
                "rejection_reason": "",
                "analyzed_at": datetime.now(timezone.utc),
                "title": raw_title,
            })
            stats["selected"] += 1
        emit(f"✅ 完成 (LLM 关闭): 抓取={stats['fetched']}, 入选={stats['selected']}")
        return stats

    for idx, doc in enumerate(pending, 1):
        content = doc.get("clean_markdown") or doc.get("raw_html", "")
        h = doc["url_hash"]
        title_preview = (doc.get("raw_title") or doc.get("url", ""))[:60]

        emit(f"🔍 [{idx}/{len(pending)}] 分析: {title_preview}")

        if not content.strip():
            emit("   ⚠️ 内容为空，跳过")
            await db.update_article(h, {
                "status": "rejected",
                "rejection_reason": "REJECTED_EMPTY_CONTENT",
                "analyzed_at": datetime.now(timezone.utc),
            })
            stats["rejected"] += 1
            continue

        analysis = await analyse_article(content, filter_prompt=active_filter_prompt)
        if analysis is None:
            emit("   ❌ LLM 分析失败")
            await db.update_article(h, {
                "status": "rejected",
                "rejection_reason": "REJECTED_LLM_FAILURE",
                "analyzed_at": datetime.now(timezone.utc),
            })
            stats["errors"] += 1
            continue

        stats["analysed"] += 1
        analysis_dict = analysis.model_dump()

        source_id = doc.get("source_id")
        source_tags = []
        if source_id:
            all_sources = await db.get_all_sources(enabled_only=False)
            for s in all_sources:
                s_id = str(s.get("id", ""))
                if s_id == source_id:
                    source_tags = s.get("tags") or []
                    break

        status, reason = evaluate_article(analysis_dict, source_tags)

        await db.update_article(h, {
            "analysis": analysis_dict,
            "status": status,
            "rejection_reason": reason,
            "analyzed_at": datetime.now(timezone.utc),
        })

        if status == "selected":
            stats["selected"] += 1
            emit(f"   ✅ 入选 [{analysis.category}] {analysis.title[:50]}")
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
            emit(f"   🚫 过滤 ({reason})")

    emit(
        f"🎉 完成! 抓取={stats['fetched']}, 分析={stats['analysed']}, "
        f"入选={stats['selected']}, 过滤={stats['rejected']}, 错误={stats['errors']}"
    )
    return stats

