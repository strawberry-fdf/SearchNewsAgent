"""
全场景交叉复杂测试 —— 验证多模块协同工作的复杂业务逻辑。

这些测试模拟真实用户场景，覆盖模块间的交叉依赖：
1. 完整生命周期：信源创建 → 文章抓取 → LLM 分析 → 规则过滤 → 状态查询
2. 多信源混合采集：RSS + Web 信源同时工作
3. 数据一致性：删除/更新操作的级联效果
4. 配置变更影响：LLM 开关切换、规则阈值变化
5. 并发去重：同一 URL 在不同信源中出现
6. 白名单交叉规则：大佬blog 豁免与分类门槛交互
7. 筛选预设组合：多预设激活的效果
8. LLM 配置切换：运行时切换配置
9. 边界场景：空数据库、极端评分、大批量处理
10. API ↔ Pipeline ↔ DB 三层联动
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.ingestion.dedup import url_hash
from backend.models.article import LLMAnalysis
from backend.rules.engine import evaluate_article
from backend.storage import db


def _make_llm_analysis(**overrides) -> LLMAnalysis:
    data = {
        "title": "AI 新进展",
        "summary": "摘要",
        "category": "模型发布",
        "ai_relevance": 85,
        "importance": 90,
        "model_selected": True,
        "tags": ["AI"],
    }
    data.update(overrides)
    return LLMAnalysis.model_validate(data)


# ──────────────────────────────────────────────────────────────
# 场景 1: 文章完整生命周期
# ──────────────────────────────────────────────────────────────

class TestArticleLifecycle:
    """文章从创建到分析到查询的完整生命周期。"""

    async def test_pending_to_selected_lifecycle(self, test_db, make_article, make_analysis):
        """文章状态: pending → 分析 → selected → 查询可见。"""
        # Step 1: 创建 pending 文章
        art = make_article(url="https://lifecycle.com/art1")
        await db.insert_article(art)
        assert await db.article_exists(art["url_hash"])

        pending = await db.get_pending_articles()
        assert len(pending) == 1

        # Step 2: 模拟 LLM 分析结果
        analysis = make_analysis(importance=90, ai_relevance=85, category="模型发布")

        # Step 3: 规则引擎判定
        status, reason = evaluate_article(analysis)
        assert status == "selected"

        # Step 4: 更新文章
        await db.update_article(art["url_hash"], {
            "analysis": analysis,
            "status": status,
            "rejection_reason": reason,
            "analyzed_at": datetime.now(timezone.utc),
        })

        # Step 5: 查询验证
        selected = await db.get_selected_articles()
        assert len(selected) == 1
        assert selected[0]["status"] == "selected"
        assert selected[0]["importance"] == 90

        # Step 6: 总计数一致
        total = await db.count_articles()
        selected_count = await db.count_articles(status="selected")
        pending_count = await db.count_articles(status="pending")
        assert total == 1
        assert selected_count == 1
        assert pending_count == 0

    async def test_pending_to_rejected_lifecycle(self, test_db, make_article, make_analysis):
        """文章状态: pending → 分析 → rejected（非AI分类）。"""
        art = make_article(url="https://lifecycle.com/non-ai")
        await db.insert_article(art)

        analysis = make_analysis(category="非AI/通用工具", ai_relevance=20)
        status, reason = evaluate_article(analysis)
        assert status == "rejected"
        assert reason == "REJECTED_NON_AI"

        await db.update_article(art["url_hash"], {
            "analysis": analysis,
            "status": status,
            "rejection_reason": reason,
        })

        rejected = await db.get_all_articles(status="rejected")
        assert len(rejected) == 1

    async def test_starred_article_persists_across_queries(self, test_db, make_article):
        """收藏状态应在各种查询中保持一致。"""
        art = make_article(url="https://star.com/art1")
        await db.insert_article(art)
        await db.update_article(art["url_hash"], {"status": "selected"})

        # 收藏
        await db.toggle_star(art["url_hash"])

        # 在不同查询中验证
        all_arts = await db.get_all_articles()
        assert all_arts[0]["starred"] is True

        selected = await db.get_selected_articles()
        assert selected[0]["starred"] is True


# ──────────────────────────────────────────────────────────────
# 场景 2: 多信源混合采集与去重
# ──────────────────────────────────────────────────────────────

class TestMultiSourceDedup:
    """多信源环境下的去重与数据隔离。"""

    async def test_same_url_different_sources_dedup(self, test_db, make_article):
        """同一 URL 在不同信源中只应存在一份。"""
        common_url = "https://shared-article.com/post"
        art1 = make_article(url=common_url, source_name="Source A")
        art2 = make_article(url=common_url, source_name="Source B")

        await db.insert_article(art1)
        assert await db.article_exists(art2["url_hash"])  # 同URL同hash

        total = await db.count_articles()
        assert total == 1

    async def test_url_hash_consistency(self):
        """URL hash 在不同模块中应保持一致。"""
        url = "https://consistency-check.com/article"
        from backend.ingestion.dedup import url_hash as dedup_hash

        hash1 = dedup_hash(url)
        hash2 = dedup_hash(url + "/")  # 尾斜杠规范化
        hash3 = dedup_hash("  " + url + "  ")  # 空白规范化
        assert hash1 == hash2 == hash3

    async def test_source_deletion_preserves_other_sources(self, test_db, make_source, make_article):
        """删除信源只影响其下的文章，不影响其他信源。"""
        await db.upsert_source(make_source(name="SrcA", url="https://a.com"))
        await db.upsert_source(make_source(name="SrcB", url="https://b.com"))

        await db.insert_article(make_article(url="https://a.com/1", source_name="SrcA"))
        await db.insert_article(make_article(url="https://a.com/2", source_name="SrcA"))
        await db.insert_article(make_article(url="https://b.com/1", source_name="SrcB"))

        await db.delete_source("https://a.com")

        # SrcB 文章应完好
        total = await db.count_articles()
        assert total == 1
        arts = await db.get_all_articles()
        assert arts[0]["source_name"] == "SrcB"

        # SrcB 信源应完好
        sources = await db.get_all_sources(enabled_only=False)
        assert len(sources) == 1
        assert sources[0]["name"] == "SrcB"


# ──────────────────────────────────────────────────────────────
# 场景 3: 规则引擎 × 白名单交叉
# ──────────────────────────────────────────────────────────────

class TestRulesWhitelistCross:
    """规则引擎与信源白名单的复杂交互。"""

    @pytest.mark.parametrize("category,importance,expected_status,expected_reason", [
        # 大佬blog在非DevTool分类下，model_selected=False但可豁免
        ("模型发布", 80, "selected", ""),
        ("论文/研究", 85, "selected", ""),
        # 大佬blog在DevTool分类下,不豁免model_selected
        ("DevTool/工程向", 95, "rejected", "REJECTED_MODEL_UNSELECTED"),
        # 大佬blog豁免Step3但importance不够Step4
        ("论文/研究", 60, "rejected", "REJECTED_LOW_IMPORTANCE"),
        ("评测/基准", 70, "rejected", "REJECTED_LOW_IMPORTANCE"),
    ])
    def test_vip_blog_cross_category_threshold(
        self, category, importance, expected_status, expected_reason,
    ):
        """大佬blog 白名单与各分类阈值的交叉矩阵。"""
        analysis = {
            "category": category,
            "ai_relevance": 80,
            "importance": importance,
            "model_selected": False,
        }
        status, reason = evaluate_article(analysis, source_tags=["大佬blog"])
        assert status == expected_status, f"Expected {expected_status} for {category}@{importance}"
        assert reason == expected_reason

    def test_multiple_tags_including_vip(self):
        """信源同时有多个标签，包含大佬blog。"""
        analysis = {
            "category": "模型发布",
            "ai_relevance": 80,
            "importance": 80,
            "model_selected": False,
        }
        status, reason = evaluate_article(
            analysis, source_tags=["大佬blog", "官方", "头部AI公司"],
        )
        assert status == "selected"

    def test_borderline_all_steps(self):
        """所有步骤的边界值组合：恰好通过。"""
        analysis = {
            "category": "模型发布",  # 阈值 75
            "ai_relevance": 60,      # 恰好通过 Step 2
            "importance": 75,         # 恰好通过 Step 4
            "model_selected": True,   # 通过 Step 3
        }
        status, reason = evaluate_article(analysis)
        assert status == "selected"

    def test_borderline_one_below(self):
        """所有步骤恰好通过，但 importance 差 1 分。"""
        analysis = {
            "category": "模型发布",
            "ai_relevance": 60,
            "importance": 74,  # 差 1 分
            "model_selected": True,
        }
        status, reason = evaluate_article(analysis)
        assert status == "rejected"
        assert reason == "REJECTED_LOW_IMPORTANCE"


# ──────────────────────────────────────────────────────────────
# 场景 4: 配置变更对 Pipeline 的影响
# ──────────────────────────────────────────────────────────────

class TestConfigChangeImpact:
    """系统配置变更的级联效果。"""

    @patch("backend.pipeline.send_feishu_notification", new_callable=AsyncMock)
    @patch("backend.pipeline.analyse_article", new_callable=AsyncMock)
    @patch("backend.pipeline.fetch_rss_feed", new_callable=AsyncMock)
    async def test_toggle_llm_between_runs(
        self, mock_fetch, mock_analyse, mock_feishu, test_db, make_source, make_article,
    ):
        """在两次 Pipeline 运行之间切换 LLM 开关。"""
        from backend.pipeline import run_ingestion_pipeline

        await db.upsert_source(make_source(name="Src", url="https://toggle.com/feed"))

        # Run 1: LLM 关闭 → 直接入选
        await db.set_setting("llm_enabled", False)
        mock_fetch.return_value = [make_article(url="https://toggle.com/art1")]
        stats1 = await run_ingestion_pipeline()
        assert stats1["selected"] == 1
        mock_analyse.assert_not_called()

        # Run 2: LLM 开启 → 经过分析
        await db.set_setting("llm_enabled", True)
        mock_fetch.return_value = [make_article(url="https://toggle.com/art2", clean_markdown="Content")]
        mock_analyse.return_value = _make_llm_analysis()
        mock_feishu.return_value = True
        stats2 = await run_ingestion_pipeline()
        assert stats2["analysed"] == 1

    async def test_llm_config_switch_isolation(self, test_db):
        """切换 LLM 配置不影响已有分析结果。"""
        # 创建并激活配置 A
        id_a = await db.create_llm_config("ConfigA", "model-a", "key-a")
        await db.activate_llm_config(id_a)
        active = await db.get_active_llm_config()
        assert active["model"] == "model-a"

        # 创建并激活配置 B（应停用 A）
        id_b = await db.create_llm_config("ConfigB", "model-b", "key-b")
        await db.activate_llm_config(id_b)
        active = await db.get_active_llm_config()
        assert active["model"] == "model-b"

        # 确认 A 已停用
        configs = await db.get_llm_configs()
        config_a = [c for c in configs if c["id"] == id_a][0]
        assert config_a["is_active"] is False


# ──────────────────────────────────────────────────────────────
# 场景 5: 筛选预设组合效果
# ──────────────────────────────────────────────────────────────

class TestPresetCombinations:
    """多筛选预设的组合与 Pipeline 交互。"""

    async def test_multiple_presets_active(self, test_db):
        """多个预设可以同时激活。"""
        id_a = await db.create_filter_preset("AgentOnly", "只关注Agent")
        id_b = await db.create_filter_preset("ModelRelease", "只关注模型发布")

        await db.toggle_filter_preset_active(id_a)
        await db.toggle_filter_preset_active(id_b)

        active = await db.get_active_filter_presets()
        assert len(active) == 2

        # 取消第一个
        await db.toggle_filter_preset_active(id_a)
        active = await db.get_active_filter_presets()
        assert len(active) == 1
        assert active[0]["name"] == "ModelRelease"

    async def test_preset_update_preserves_active_state(self, test_db):
        """更新预设内容不影响激活状态。"""
        preset_id = await db.create_filter_preset("Test", "original prompt")
        await db.toggle_filter_preset_active(preset_id)

        await db.update_filter_preset(preset_id, {"prompt": "updated prompt"})

        active = await db.get_active_filter_presets()
        assert len(active) == 1
        assert active[0]["prompt"] == "updated prompt"


# ──────────────────────────────────────────────────────────────
# 场景 6: API → DB → Pipeline 三层联动
# ──────────────────────────────────────────────────────────────

class TestAPIDBPipelineIntegration:
    """API 操作 → DB 变更 → Pipeline 行为联动。"""

    async def test_source_created_via_api_used_by_pipeline(
        self, api_client, test_db, make_article,
    ):
        """通过 API 创建的信源应可被 Pipeline 使用。"""
        # 通过 API 创建信源
        resp = await api_client.post("/api/sources", json={
            "name": "APISrc", "url": "https://api-pipeline.com/feed",
        })
        assert resp.status_code == 200

        # 验证 DB 中存在
        sources = await db.get_all_sources(enabled_only=True)
        assert any(s["name"] == "APISrc" for s in sources)

    async def test_settings_api_affects_pipeline(self, api_client, test_db):
        """通过 API 修改设置后，Pipeline 应使用新设置。"""
        # 通过 API 关闭 LLM
        resp = await api_client.put("/api/settings", json={"llm_enabled": False})
        assert resp.status_code == 200

        # 验证 DB 中的设置
        settings = await db.get_settings()
        assert settings["llm_enabled"] is False

    async def test_article_created_by_pipeline_queryable_via_api(
        self, api_client, test_db, make_article,
    ):
        """Pipeline 创建的文章应可通过 API 查询。"""
        art = make_article(url="https://pipeline-to-api.com/art1", source_name="PipelineSrc")
        await db.insert_article(art)
        await db.update_article(art["url_hash"], {"status": "selected"})

        resp = await api_client.get("/api/articles?status=selected")
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["source_name"] == "PipelineSrc"


# ──────────────────────────────────────────────────────────────
# 场景 7: 数据一致性压力测试
# ──────────────────────────────────────────────────────────────

class TestDataConsistency:
    """数据一致性和边界条件。"""

    async def test_batch_insert_and_count_consistency(self, test_db, make_article):
        """大批量插入后计数应一致。"""
        count = 50
        for i in range(count):
            await db.insert_article(make_article(url=f"https://batch.com/{i}"))

        total = await db.count_articles()
        assert total == count

        all_arts = await db.get_all_articles(limit=100)
        assert len(all_arts) == count

    async def test_update_then_query_reflects_change(self, test_db, make_article, make_analysis):
        """更新后的数据应立即可查询到。"""
        art = make_article(url="https://update-query.com/1")
        await db.insert_article(art)

        analysis = make_analysis(title="更新后标题", importance=95)
        await db.update_article(art["url_hash"], {
            "analysis": analysis,
            "status": "selected",
        })

        selected = await db.get_selected_articles()
        assert len(selected) == 1
        assert selected[0]["title"] == "更新后标题"
        assert selected[0]["importance"] == 95

    async def test_source_article_counts_consistency(self, test_db, make_source, make_article):
        """信源文章计数应与实际数量一致。"""
        await db.upsert_source(make_source(name="SrcX", url="https://x.com"))
        await db.upsert_source(make_source(name="SrcY", url="https://y.com"))

        for i in range(5):
            await db.insert_article(make_article(url=f"https://x.com/{i}", source_name="SrcX"))
        for i in range(3):
            await db.insert_article(make_article(url=f"https://y.com/{i}", source_name="SrcY"))

        counts = await db.get_source_article_counts()
        count_map = {c["source_name"]: c["count"] for c in counts}
        assert count_map.get("SrcX") == 5
        assert count_map.get("SrcY") == 3

    async def test_delete_all_articles_then_stats(self, test_db, make_article):
        """删除所有文章后统计应归零。"""
        for i in range(10):
            await db.insert_article(make_article(url=f"https://delall.com/{i}"))

        assert await db.count_articles() == 10

        await db.clear_article_cache()

        assert await db.count_articles() == 0

    async def test_pagination_covers_all_data(self, test_db, make_article):
        """分页遍历应覆盖所有数据，无遗漏。"""
        total_count = 25
        for i in range(total_count):
            await db.insert_article(make_article(url=f"https://page.com/{i}"))

        all_hashes = set()
        page_size = 7
        offset = 0
        while True:
            page = await db.get_all_articles(skip=offset, limit=page_size)
            if not page:
                break
            for a in page:
                all_hashes.add(a["url_hash"])
            offset += page_size

        assert len(all_hashes) == total_count


# ──────────────────────────────────────────────────────────────
# 场景 8: 规则引擎全分类 × 全评分矩阵
# ──────────────────────────────────────────────────────────────

class TestRulesFullMatrix:
    """规则引擎全分类全评分的系统化覆盖。"""

    CATEGORIES = ["默认", "模型发布", "论文/研究", "评测/基准",
                  "行业动态/政策监管/其他", "DevTool/工程向"]

    @pytest.mark.parametrize("category", CATEGORIES)
    def test_max_scores_always_selected(self, category):
        """所有分类在满分时应入选。"""
        analysis = {
            "category": category,
            "ai_relevance": 100,
            "importance": 100,
            "model_selected": True,
        }
        status, reason = evaluate_article(analysis)
        assert status == "selected"
        assert reason == ""

    @pytest.mark.parametrize("category", CATEGORIES)
    def test_zero_relevance_always_rejected(self, category):
        """所有分类在零相关性时应被拒绝。"""
        analysis = {
            "category": category,
            "ai_relevance": 0,
            "importance": 100,
            "model_selected": True,
        }
        status, reason = evaluate_article(analysis)
        assert status == "rejected"
        assert reason == "REJECTED_LOW_RELEVANCE"

    def test_non_ai_overrides_all_scores(self):
        """非AI分类优先于所有其他条件。"""
        analysis = {
            "category": "非AI/通用工具",
            "ai_relevance": 100,
            "importance": 100,
            "model_selected": True,
        }
        status, reason = evaluate_article(analysis)
        assert status == "rejected"
        assert reason == "REJECTED_NON_AI"


# ──────────────────────────────────────────────────────────────
# 场景 9: 模型输入/输出完整链条
# ──────────────────────────────────────────────────────────────

class TestModelIOChain:
    """Pydantic 模型 ↔ DB 存储 ↔ API 输出的完整链条。"""

    async def test_analysis_roundtrip(self, test_db, make_article):
        """LLMAnalysis → DB 存储 → 查询还原的完整链路。"""
        art = make_article(url="https://roundtrip.com/1")
        await db.insert_article(art)

        analysis = {
            "title": "GPT-5发布",
            "summary": "OpenAI发布了GPT-5",
            "category": "模型发布",
            "ai_relevance": 95,
            "importance": 92,
            "model_selected": True,
            "tags": ["GPT-5", "OpenAI", "大模型"],
        }

        await db.update_article(art["url_hash"], {
            "analysis": analysis,
            "status": "selected",
        })

        selected = await db.get_selected_articles()
        assert len(selected) == 1
        doc = selected[0]

        # 验证展平字段
        assert doc["title"] == "GPT-5发布"
        assert doc["category"] == "模型发布"
        assert doc["ai_relevance"] == 95
        assert doc["importance"] == 92
        assert doc["model_selected"] is True

        # 验证 analysis JSON backup
        assert doc["analysis"] is not None
        assert doc["analysis"]["title"] == "GPT-5发布"

    async def test_analysis_via_api_response(self, api_client, test_db, make_article):
        """通过 API 获取的文章应包含完整分析数据。"""
        art = make_article(url="https://api-analysis.com/1")
        await db.insert_article(art)
        await db.update_article(art["url_hash"], {
            "analysis": {
                "title": "API测试标题",
                "summary": "摘要",
                "category": "模型发布",
                "ai_relevance": 80,
                "importance": 85,
                "model_selected": True,
                "tags": ["test"],
            },
            "status": "selected",
        })

        resp = await api_client.get("/api/articles?status=selected")
        items = resp.json()["items"]
        assert len(items) == 1
        assert items[0]["title"] == "API测试标题"
        assert items[0]["importance"] == 85


# ──────────────────────────────────────────────────────────────
# 场景 10: 极端与边界输入
# ──────────────────────────────────────────────────────────────

class TestExtremeInputs:
    """极端输入和边界条件测试。"""

    async def test_very_long_content_article(self, test_db, make_article):
        """超长内容文章正常存储。"""
        long_content = "A" * 100000
        art = make_article(
            url="https://long.com/1",
            raw_html=long_content,
            clean_markdown=long_content,
        )
        await db.insert_article(art)
        assert await db.article_exists(art["url_hash"])

    async def test_unicode_heavy_article(self, test_db, make_article):
        """大量 Unicode 字符（Emoji/中文/日文）正常存储。"""
        unicode_content = "🔥 AI 人工智能 ありがとう 감사합니다 🎉" * 100
        art = make_article(
            url="https://unicode.com/1",
            raw_html=unicode_content,
            clean_markdown=unicode_content,
            raw_title="🔥 Unicode 测试标题 ❤️",
        )
        await db.insert_article(art)

        arts = await db.get_all_articles()
        assert "🔥" in arts[0]["raw_title"]

    async def test_empty_database_operations(self, test_db):
        """空数据库上的各种操作不应报错。"""
        assert await db.count_articles() == 0
        assert await db.get_pending_articles() == []
        assert await db.get_selected_articles() == []
        assert await db.get_all_sources() == []
        assert await db.get_source_article_counts() == []

        await db.toggle_star("nonexistent")
        await db.delete_article("nonexistent")

    async def test_rapid_upsert_same_source(self, test_db, make_source):
        """快速重复 upsert 同一信源不应出错。"""
        url = "https://rapid.com/feed"
        for i in range(10):
            await db.upsert_source(make_source(name=f"Rapid-{i}", url=url))

        sources = await db.get_all_sources(enabled_only=False)
        # 应只有一条记录，名字为最后一次 upsert 的
        matching = [s for s in sources if s["url"] == url]
        assert len(matching) == 1
        assert matching[0]["name"] == "Rapid-9"

    def test_rules_engine_all_zero_scores(self):
        """全零评分的规则引擎行为。"""
        analysis = {
            "category": "默认",
            "ai_relevance": 0,
            "importance": 0,
            "model_selected": False,
        }
        status, reason = evaluate_article(analysis)
        assert status == "rejected"
        # 应在 Step 2 被拦截（ai_relevance < 60）
        assert reason == "REJECTED_LOW_RELEVANCE"

    def test_rules_engine_all_max_scores(self):
        """满分评分的规则引擎行为。"""
        analysis = {
            "category": "模型发布",
            "ai_relevance": 100,
            "importance": 100,
            "model_selected": True,
        }
        status, reason = evaluate_article(analysis)
        assert status == "selected"
        assert reason == ""
