"""
Pipeline 编排器 (pipeline.py) 集成测试。

使用 mock 隔离外部依赖（LLM API、HTTP 请求、飞书推送），
测试流水线的端到端编排逻辑：
- 无信源时快速结束
- LLM 关闭时所有文章直接入选
- 正常流程：抓取 → LLM 分析 → 规则过滤 → 通知
- 去重逻辑
- LLM 分析失败的容错处理
- 空内容文章跳过
- 进度回调 (progress_cb) 正常工作
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.models.article import LLMAnalysis
from backend.storage import db


# ──────────────────────────────────────────────────────────────
# 工具函数
# ──────────────────────────────────────────────────────────────

def _make_llm_analysis(**overrides) -> LLMAnalysis:
    """构建 LLMAnalysis 实例。"""
    data = {
        "title": "AI 新突破",
        "summary": "重要的技术进展",
        "category": "模型发布",
        "ai_relevance": 85,
        "importance": 90,
        "model_selected": True,
        "tags": ["AI"],
    }
    data.update(overrides)
    return LLMAnalysis.model_validate(data)


# ──────────────────────────────────────────────────────────────
# Pipeline 集成测试
# ──────────────────────────────────────────────────────────────

@pytest.mark.integration
class TestPipelineIntegration:
    """Pipeline 端到端集成测试（mock 外部调用）。"""

    async def test_no_sources_early_return(self, test_db):
        """无启用信源时应快速返回零统计。"""
        from backend.pipeline import run_ingestion_pipeline

        logs = []
        stats = await run_ingestion_pipeline(progress_cb=logs.append)

        assert stats["fetched"] == 0
        assert stats["selected"] == 0
        assert any("没有启用的信源" in l for l in logs)

    @patch("backend.pipeline.send_feishu_notification", new_callable=AsyncMock)
    @patch("backend.pipeline.analyse_article", new_callable=AsyncMock)
    @patch("backend.pipeline.fetch_rss_feed", new_callable=AsyncMock)
    async def test_llm_disabled_all_selected(
        self, mock_fetch, mock_analyse, mock_feishu, test_db, make_source, make_article,
    ):
        """LLM 关闭时，所有文章应直接入选，跳过分析和规则引擎。"""
        from backend.pipeline import run_ingestion_pipeline

        # 设置 LLM 关闭
        await db.set_setting("llm_enabled", False)

        # 添加一个信源
        await db.upsert_source(make_source(name="TestSrc", url="https://test.com/feed"))

        # 模拟 RSS 返回 2 篇文章
        mock_fetch.return_value = [
            make_article(url="https://test.com/art1", raw_title="Article 1"),
            make_article(url="https://test.com/art2", raw_title="Article 2"),
        ]

        stats = await run_ingestion_pipeline()

        assert stats["fetched"] == 2
        assert stats["selected"] == 2
        assert stats["analysed"] == 0  # LLM 未被调用
        mock_analyse.assert_not_called()

    @patch("backend.pipeline.send_feishu_notification", new_callable=AsyncMock)
    @patch("backend.pipeline.analyse_article", new_callable=AsyncMock)
    @patch("backend.pipeline.fetch_rss_feed", new_callable=AsyncMock)
    async def test_full_pipeline_with_selection(
        self, mock_fetch, mock_analyse, mock_feishu, test_db, make_source, make_article,
    ):
        """完整流程：抓取 → 分析 → 规则过滤，高分文章入选。"""
        from backend.pipeline import run_ingestion_pipeline

        await db.set_setting("llm_enabled", True)
        await db.upsert_source(make_source(name="TestSrc", url="https://test.com/feed"))

        mock_fetch.return_value = [
            make_article(url="https://test.com/good", clean_markdown="AI text"),
        ]
        mock_analyse.return_value = _make_llm_analysis(
            importance=90, ai_relevance=85, model_selected=True, category="模型发布",
        )
        mock_feishu.return_value = True

        stats = await run_ingestion_pipeline()

        assert stats["fetched"] == 1
        assert stats["analysed"] == 1
        assert stats["selected"] == 1
        mock_feishu.assert_called_once()

    @patch("backend.pipeline.send_feishu_notification", new_callable=AsyncMock)
    @patch("backend.pipeline.analyse_article", new_callable=AsyncMock)
    @patch("backend.pipeline.fetch_rss_feed", new_callable=AsyncMock)
    async def test_full_pipeline_with_rejection(
        self, mock_fetch, mock_analyse, mock_feishu, test_db, make_source, make_article,
    ):
        """低分文章应被过滤掉。"""
        from backend.pipeline import run_ingestion_pipeline

        await db.set_setting("llm_enabled", True)
        await db.upsert_source(make_source(name="TestSrc", url="https://test.com/feed"))

        mock_fetch.return_value = [
            make_article(url="https://test.com/low", clean_markdown="Low quality content"),
        ]
        mock_analyse.return_value = _make_llm_analysis(
            importance=30, ai_relevance=40, model_selected=False, category="非AI/通用工具",
        )

        stats = await run_ingestion_pipeline()

        assert stats["fetched"] == 1
        assert stats["rejected"] == 1
        assert stats["selected"] == 0
        mock_feishu.assert_not_called()

    @patch("backend.pipeline.send_feishu_notification", new_callable=AsyncMock)
    @patch("backend.pipeline.analyse_article", new_callable=AsyncMock)
    @patch("backend.pipeline.fetch_rss_feed", new_callable=AsyncMock)
    async def test_duplicate_articles_skipped(
        self, mock_fetch, mock_analyse, mock_feishu, test_db, make_source, make_article,
    ):
        """已存在的文章应被去重跳过。"""
        from backend.pipeline import run_ingestion_pipeline

        await db.upsert_source(make_source(name="Src", url="https://dup.com/feed"))

        art = make_article(url="https://dup.com/existing")
        await db.insert_article(art)  # 预先插入
        # 标记为已处理，避免进入 pending 分析阶段
        await db.update_article(art["url_hash"], {"status": "selected"})

        mock_fetch.return_value = [art]  # 再次返回同一篇

        stats = await run_ingestion_pipeline()
        assert stats["duplicates"] == 1
        assert stats["fetched"] == 0

    @patch("backend.pipeline.send_feishu_notification", new_callable=AsyncMock)
    @patch("backend.pipeline.analyse_article", new_callable=AsyncMock)
    @patch("backend.pipeline.fetch_rss_feed", new_callable=AsyncMock)
    async def test_llm_failure_counted_as_error(
        self, mock_fetch, mock_analyse, mock_feishu, test_db, make_source, make_article,
    ):
        """LLM 分析返回 None 时应计入 errors。"""
        from backend.pipeline import run_ingestion_pipeline

        await db.set_setting("llm_enabled", True)
        await db.upsert_source(make_source(name="Src", url="https://err.com/feed"))

        mock_fetch.return_value = [
            make_article(url="https://err.com/fail", clean_markdown="Some content"),
        ]
        mock_analyse.return_value = None  # LLM 失败

        stats = await run_ingestion_pipeline()
        assert stats["errors"] == 1
        assert stats["analysed"] == 0

    @patch("backend.pipeline.send_feishu_notification", new_callable=AsyncMock)
    @patch("backend.pipeline.analyse_article", new_callable=AsyncMock)
    @patch("backend.pipeline.fetch_rss_feed", new_callable=AsyncMock)
    async def test_empty_content_skipped(
        self, mock_fetch, mock_analyse, mock_feishu, test_db, make_source, make_article,
    ):
        """空内容文章应跳过 LLM 分析，标记为 rejected。"""
        from backend.pipeline import run_ingestion_pipeline

        await db.set_setting("llm_enabled", True)
        await db.upsert_source(make_source(name="Src", url="https://empty.com/feed"))

        mock_fetch.return_value = [
            make_article(url="https://empty.com/blank", clean_markdown="", raw_html=""),
        ]

        stats = await run_ingestion_pipeline()
        assert stats["rejected"] == 1
        mock_analyse.assert_not_called()

    @patch("backend.pipeline.send_feishu_notification", new_callable=AsyncMock)
    @patch("backend.pipeline.analyse_article", new_callable=AsyncMock)
    @patch("backend.pipeline.fetch_rss_feed", new_callable=AsyncMock)
    async def test_progress_callback_invoked(
        self, mock_fetch, mock_analyse, mock_feishu, test_db, make_source, make_article,
    ):
        """进度回调函数应被调用多次。"""
        from backend.pipeline import run_ingestion_pipeline

        await db.upsert_source(make_source(name="Src", url="https://cb.com/feed"))
        mock_fetch.return_value = []

        logs = []
        await run_ingestion_pipeline(progress_cb=logs.append)

        assert len(logs) >= 2  # 至少有开始和结束消息

    @patch("backend.pipeline.send_feishu_notification", new_callable=AsyncMock)
    @patch("backend.pipeline.analyse_article", new_callable=AsyncMock)
    @patch("backend.pipeline.fetch_rss_feed", new_callable=AsyncMock)
    async def test_fetch_error_counted(
        self, mock_fetch, mock_analyse, mock_feishu, test_db, make_source,
    ):
        """信源抓取失败应计入 errors。"""
        from backend.pipeline import run_ingestion_pipeline

        await db.upsert_source(make_source(name="BadSrc", url="https://bad.com/feed"))
        mock_fetch.side_effect = Exception("Network error")

        stats = await run_ingestion_pipeline()
        assert stats["errors"] == 1

    @patch("backend.pipeline.send_feishu_notification", new_callable=AsyncMock)
    @patch("backend.pipeline.analyse_article", new_callable=AsyncMock)
    @patch("backend.pipeline.fetch_rss_feed", new_callable=AsyncMock)
    async def test_filter_prompt_passed_through(
        self, mock_fetch, mock_analyse, mock_feishu, test_db, make_source, make_article,
    ):
        """自定义 filter_prompt 应传递给 analyse_article。"""
        from backend.pipeline import run_ingestion_pipeline

        await db.set_setting("llm_enabled", True)
        await db.upsert_source(make_source(name="Src", url="https://fp.com/feed"))

        mock_fetch.return_value = [
            make_article(url="https://fp.com/art1", clean_markdown="Content"),
        ]
        mock_analyse.return_value = _make_llm_analysis()

        await run_ingestion_pipeline(filter_prompt="只关注 Agent")

        # 验证 filter_prompt 被传递
        call_kwargs = mock_analyse.call_args
        assert "只关注 Agent" in str(call_kwargs)

    @patch("backend.pipeline.send_feishu_notification", new_callable=AsyncMock)
    @patch("backend.pipeline.analyse_article", new_callable=AsyncMock)
    @patch("backend.pipeline.fetch_rss_feed", new_callable=AsyncMock)
    async def test_respect_source_intervals_skips_recent(
        self, mock_fetch, mock_analyse, mock_feishu, test_db, make_source,
    ):
        """respect_source_intervals=True 时，刚抓过的信源应被跳过。"""
        from backend.pipeline import run_ingestion_pipeline

        # 信源间隔 60 分钟，刚刚抓取过
        recent = datetime.now(timezone.utc).isoformat()
        await db.upsert_source(make_source(
            name="RecentSrc", url="https://recent.com/feed",
            fetch_interval_minutes=60,
        ))
        await db.update_source_last_fetched("https://recent.com/feed")

        mock_fetch.return_value = []
        logs: list[str] = []
        stats = await run_ingestion_pipeline(
            progress_cb=logs.append,
            respect_source_intervals=True,
        )

        # fetch_rss_feed 不应被调用（信源被跳过）
        mock_fetch.assert_not_called()
        # 应有跳过提示
        assert any("跳过" in l for l in logs)

    @patch("backend.pipeline.send_feishu_notification", new_callable=AsyncMock)
    @patch("backend.pipeline.analyse_article", new_callable=AsyncMock)
    @patch("backend.pipeline.fetch_rss_feed", new_callable=AsyncMock)
    async def test_respect_source_intervals_fetches_overdue(
        self, mock_fetch, mock_analyse, mock_feishu, test_db, make_source,
    ):
        """respect_source_intervals=True 时，超过间隔的信源应正常抓取。"""
        from backend.pipeline import run_ingestion_pipeline

        # 信源间隔 1 分钟，最后抓取时间设为很久以前
        await db.upsert_source(make_source(
            name="OverdueSrc", url="https://overdue.com/feed",
            fetch_interval_minutes=1,
        ))
        # 手动设一个很旧的 last_fetched_at
        conn = await db.get_db()
        await conn.execute(
            "UPDATE sources SET last_fetched_at = ? WHERE url = ?",
            ("2020-01-01T00:00:00+00:00", "https://overdue.com/feed"),
        )
        await conn.commit()

        mock_fetch.return_value = []
        stats = await run_ingestion_pipeline(respect_source_intervals=True)

        # 应该被抓取
        mock_fetch.assert_called_once()

    @patch("backend.pipeline.send_feishu_notification", new_callable=AsyncMock)
    @patch("backend.pipeline.analyse_article", new_callable=AsyncMock)
    @patch("backend.pipeline.fetch_rss_feed", new_callable=AsyncMock)
    async def test_manual_trigger_ignores_intervals(
        self, mock_fetch, mock_analyse, mock_feishu, test_db, make_source,
    ):
        """手动触发（默认 respect_source_intervals=False）忽略间隔限制。"""
        from backend.pipeline import run_ingestion_pipeline

        await db.upsert_source(make_source(
            name="ManualSrc", url="https://manual.com/feed",
            fetch_interval_minutes=9999,
        ))
        await db.update_source_last_fetched("https://manual.com/feed")

        mock_fetch.return_value = []
        stats = await run_ingestion_pipeline()  # default=False

        # 即使刚刚抓过，手动触发也应抓取
        mock_fetch.assert_called_once()
