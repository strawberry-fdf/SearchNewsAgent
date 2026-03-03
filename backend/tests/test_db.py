"""
存储层 (storage/db.py) 单元测试。

覆盖场景:
- Schema 初始化和迁移
- 信源 CRUD (upsert/get/update/delete)
- 文章 CRUD (insert/update/get/delete/exists)
- 文章查询（状态过滤、分类过滤、关键词搜索、排序、分页）
- 收藏切换
- 用户标签管理
- 设置键值存储
- 兴趣标签 CRUD
- 关键词规则 CRUD
- Pipeline 执行记录
- 筛选预设方案 (filter presets)
- LLM 配置管理（多配置单激活）
- 文章缓存统计与清理
- 级联删除
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

import pytest

from backend.storage import db


# ──────────────────────────────────────────────────────────────
# 信源 CRUD 测试
# ──────────────────────────────────────────────────────────────

class TestSourceCRUD:
    """信源增删改查测试。"""

    async def test_upsert_new_source(self, test_db, make_source):
        """插入新信源应返回 UUID。"""
        src = make_source(name="OpenAI Blog", url="https://openai.com/blog/rss.xml")
        src_id = await db.upsert_source(src)
        assert len(src_id) == 36  # UUID 格式

    async def test_upsert_existing_source_updates(self, test_db, make_source):
        """相同 URL 再次 upsert 应更新而非新建。"""
        url = "https://example.com/feed"
        src1 = make_source(name="Old Name", url=url)
        id1 = await db.upsert_source(src1)

        src2 = make_source(name="New Name", url=url)
        id2 = await db.upsert_source(src2)

        assert id1 == id2  # 同一 ID
        sources = await db.get_all_sources(enabled_only=False)
        names = [s["name"] for s in sources]
        assert "New Name" in names

    async def test_get_all_sources_enabled_only(self, test_db, make_source):
        """enabled_only=True 应只返回已启用的信源。"""
        await db.upsert_source(make_source(name="Active", url="https://a.com", enabled=True))
        await db.upsert_source(make_source(name="Inactive", url="https://b.com", enabled=False))

        enabled = await db.get_all_sources(enabled_only=True)
        all_sources = await db.get_all_sources(enabled_only=False)

        assert len(enabled) == 1
        assert len(all_sources) == 2

    async def test_update_source(self, test_db, make_source):
        """更新信源属性。"""
        src_id = await db.upsert_source(make_source(url="https://c.com"))
        ok = await db.update_source(src_id, {"enabled": False, "category": "AI博客"})
        assert ok is True

        sources = await db.get_all_sources(enabled_only=False)
        updated = [s for s in sources if s["id"] == src_id][0]
        assert updated["enabled"] is False
        assert updated["category"] == "AI博客"

    async def test_update_source_not_found(self, test_db):
        """更新不存在的信源应返回 False。"""
        ok = await db.update_source("nonexistent-id", {"enabled": False})
        assert ok is False

    async def test_delete_source(self, test_db, make_source):
        """删除信源。"""
        await db.upsert_source(make_source(name="ToDelete", url="https://del.com"))
        ok = await db.delete_source("https://del.com")
        assert ok is True

        sources = await db.get_all_sources(enabled_only=False)
        assert all(s["url"] != "https://del.com" for s in sources)

    async def test_delete_source_not_found(self, test_db):
        """删除不存在的信源应返回 False。"""
        ok = await db.delete_source("https://nonexistent.com")
        assert ok is False

    async def test_delete_source_cascade_articles(self, test_db, make_source, make_article):
        """删除信源应级联删除其下所有文章。"""
        await db.upsert_source(make_source(name="CascadeSrc", url="https://cascade.com"))
        await db.insert_article(make_article(source_name="CascadeSrc", url="https://cascade.com/art1"))
        await db.insert_article(make_article(source_name="CascadeSrc", url="https://cascade.com/art2"))
        await db.insert_article(make_article(source_name="OtherSrc", url="https://other.com/art1"))

        await db.delete_source("https://cascade.com")

        total = await db.count_articles()
        assert total == 1  # 只剩 OtherSrc 的文章

    async def test_update_source_last_fetched(self, test_db, make_source):
        """更新信源最后抓取时间。"""
        url = "https://timing.com"
        await db.upsert_source(make_source(url=url))
        await db.update_source_last_fetched(url)

        sources = await db.get_all_sources(enabled_only=False)
        src = [s for s in sources if s["url"] == url][0]
        assert src["last_fetched_at"] is not None


# ──────────────────────────────────────────────────────────────
# 文章 CRUD 测试
# ──────────────────────────────────────────────────────────────

class TestArticleCRUD:
    """文章增删改查测试。"""

    async def test_insert_and_exists(self, test_db, make_article):
        """插入文章后 exists 应返回 True。"""
        art = make_article(url="https://unique-article.com")
        await db.insert_article(art)
        assert await db.article_exists(art["url_hash"]) is True

    async def test_not_exists(self, test_db):
        """不存在的文章 hash 应返回 False。"""
        assert await db.article_exists("nonexistent_hash") is False

    async def test_insert_article_returns_uuid(self, test_db, make_article):
        """insert_article 应返回 UUID。"""
        art = make_article()
        art_id = await db.insert_article(art)
        assert len(art_id) == 36

    async def test_update_article_status(self, test_db, make_article):
        """更新文章状态。"""
        art = make_article()
        await db.insert_article(art)
        ok = await db.update_article(art["url_hash"], {"status": "selected"})
        assert ok is True

    async def test_update_article_with_analysis(self, test_db, make_article, make_analysis):
        """更新文章含分析数据时应展平存储。"""
        art = make_article()
        await db.insert_article(art)

        analysis = make_analysis(title="分析标题", importance=88)
        ok = await db.update_article(art["url_hash"], {
            "analysis": analysis,
            "status": "selected",
        })
        assert ok is True

        # 验证展平的字段
        articles = await db.get_all_articles(limit=1)
        updated = articles[0]
        assert updated["title"] == "分析标题"
        assert updated["importance"] == 88
        assert updated["status"] == "selected"

    async def test_get_pending_articles(self, test_db, make_article):
        """获取 pending 状态文章。"""
        for i in range(5):
            await db.insert_article(make_article(url=f"https://example.com/art{i}"))

        pending = await db.get_pending_articles(limit=10)
        assert len(pending) == 5
        assert all(a["status"] == "pending" for a in pending)

    async def test_get_pending_articles_limit(self, test_db, make_article):
        """pending 文章的 limit 参数。"""
        for i in range(10):
            await db.insert_article(make_article(url=f"https://example.com/art{i}"))

        pending = await db.get_pending_articles(limit=3)
        assert len(pending) == 3

    async def test_toggle_star(self, test_db, make_article):
        """切换收藏状态。"""
        art = make_article()
        await db.insert_article(art)

        # 第一次切换：False → True
        new_state = await db.toggle_star(art["url_hash"])
        assert new_state is True

        # 第二次切换：True → False
        new_state = await db.toggle_star(art["url_hash"])
        assert new_state is False

    async def test_toggle_star_not_found(self, test_db):
        """切换不存在文章的收藏应返回 False。"""
        result = await db.toggle_star("nonexistent_hash")
        assert result is False

    async def test_delete_article(self, test_db, make_article):
        """删除单篇文章。"""
        art = make_article()
        await db.insert_article(art)
        ok = await db.delete_article(art["url_hash"])
        assert ok is True
        assert await db.article_exists(art["url_hash"]) is False

    async def test_delete_articles_batch(self, test_db, make_article):
        """批量删除文章。"""
        hashes = []
        for i in range(5):
            art = make_article(url=f"https://batch.com/{i}")
            await db.insert_article(art)
            hashes.append(art["url_hash"])

        deleted = await db.delete_articles_batch(hashes[:3])
        assert deleted == 3
        total = await db.count_articles()
        assert total == 2

    async def test_update_article_user_tags(self, test_db, make_article):
        """更新文章用户自定义标签。"""
        art = make_article()
        await db.insert_article(art)
        ok = await db.update_article_user_tags(art["url_hash"], ["RAG", "Agent"])
        assert ok is True


# ──────────────────────────────────────────────────────────────
# 文章查询测试
# ──────────────────────────────────────────────────────────────

class TestArticleQueries:
    """文章查询与过滤测试。"""

    async def _seed_articles(self, make_article):
        """种子数据：插入多篇不同状态/分类的文章。"""
        articles = [
            {**make_article(url="https://a.com/1", source_name="SourceA"), "status": "selected"},
            {**make_article(url="https://a.com/2", source_name="SourceA"), "status": "selected"},
            {**make_article(url="https://b.com/1", source_name="SourceB"), "status": "rejected"},
            {**make_article(url="https://c.com/1", source_name="SourceC"), "status": "pending"},
        ]
        for art in articles:
            await db.insert_article(art)
            if art["status"] != "pending":
                await db.update_article(art["url_hash"], {"status": art["status"]})
        return articles

    async def test_count_articles_total(self, test_db, make_article):
        """总文章计数。"""
        await self._seed_articles(make_article)
        assert await db.count_articles() == 4

    async def test_count_articles_by_status(self, test_db, make_article):
        """按状态计数。"""
        await self._seed_articles(make_article)
        assert await db.count_articles(status="selected") == 2
        assert await db.count_articles(status="rejected") == 1
        assert await db.count_articles(status="pending") == 1

    async def test_count_articles_by_source(self, test_db, make_article):
        """按信源计数。"""
        await self._seed_articles(make_article)
        assert await db.count_articles(source_name="SourceA") == 2

    async def test_get_selected_articles(self, test_db, make_article):
        """获取精选文章。"""
        await self._seed_articles(make_article)
        selected = await db.get_selected_articles()
        assert len(selected) == 2

    async def test_get_selected_articles_by_source(self, test_db, make_article):
        """按信源过滤精选文章。"""
        await self._seed_articles(make_article)
        selected = await db.get_selected_articles(source_name="SourceA")
        assert len(selected) == 2
        selected_b = await db.get_selected_articles(source_name="SourceB")
        assert len(selected_b) == 0

    async def test_get_all_articles_pagination(self, test_db, make_article):
        """文章分页查询。"""
        for i in range(10):
            await db.insert_article(make_article(url=f"https://page.com/{i}"))

        page1 = await db.get_all_articles(skip=0, limit=3)
        page2 = await db.get_all_articles(skip=3, limit=3)
        assert len(page1) == 3
        assert len(page2) == 3
        # 确保不重叠
        ids1 = {a["url_hash"] for a in page1}
        ids2 = {a["url_hash"] for a in page2}
        assert ids1.isdisjoint(ids2)

    async def test_get_all_articles_keyword_search(self, test_db, make_article):
        """关键词搜索。"""
        art_with_title = make_article(url="https://kw.com/1", raw_title="GPT-5 重磅发布")
        await db.insert_article(art_with_title)
        await db.update_article(art_with_title["url_hash"], {"title": "GPT-5 重磅发布"})

        art_no_match = make_article(url="https://kw.com/2", raw_title="普通新闻")
        await db.insert_article(art_no_match)

        results = await db.get_all_articles(keyword="GPT-5")
        assert len(results) >= 1

    async def test_get_source_article_counts(self, test_db, make_article):
        """按信源聚合文章数量。"""
        await self._seed_articles(make_article)
        counts = await db.get_source_article_counts()
        assert len(counts) >= 2  # 至少有 SourceA 和 SourceB

    async def test_get_source_article_counts_by_status(self, test_db, make_article):
        """按状态过滤的信源文章计数。"""
        await self._seed_articles(make_article)
        counts = await db.get_source_article_counts(status="selected")
        total = sum(c["count"] for c in counts)
        assert total == 2


# ──────────────────────────────────────────────────────────────
# 设置 (Settings) 键值存储测试
# ──────────────────────────────────────────────────────────────

class TestSettings:
    """全局设置键值存储测试。"""

    async def test_default_settings(self, test_db):
        """未设置时应返回默认值。"""
        s = await db.get_settings()
        assert s["llm_enabled"] is True
        assert s["llm_filter_prompt"] == ""

    async def test_set_and_get(self, test_db):
        """设置值后应能读取。"""
        await db.set_setting("llm_enabled", False)
        s = await db.get_settings()
        assert s["llm_enabled"] is False

    async def test_overwrite_setting(self, test_db):
        """覆盖已有设置。"""
        await db.set_setting("llm_filter_prompt", "first")
        await db.set_setting("llm_filter_prompt", "second")
        s = await db.get_settings()
        assert s["llm_filter_prompt"] == "second"

    async def test_complex_setting_value(self, test_db):
        """存储复杂数据结构（列表/字典）。"""
        await db.set_setting("pinned_categories", ["AI博客", "论文"])
        s = await db.get_settings()
        assert s["pinned_categories"] == ["AI博客", "论文"]


# ──────────────────────────────────────────────────────────────
# 兴趣标签测试
# ──────────────────────────────────────────────────────────────

class TestInterestTags:
    async def test_add_and_get(self, test_db):
        await db.add_interest_tag("Agent")
        await db.add_interest_tag("RAG")
        tags = await db.get_interest_tags()
        assert "Agent" in tags
        assert "RAG" in tags

    async def test_add_duplicate_ignored(self, test_db):
        await db.add_interest_tag("Agent")
        await db.add_interest_tag("Agent")  # 重复
        tags = await db.get_interest_tags()
        assert tags.count("Agent") == 1

    async def test_delete(self, test_db):
        await db.add_interest_tag("ToDelete")
        ok = await db.delete_interest_tag("ToDelete")
        assert ok is True
        tags = await db.get_interest_tags()
        assert "ToDelete" not in tags

    async def test_delete_nonexistent(self, test_db):
        ok = await db.delete_interest_tag("NonExistent")
        assert ok is False


# ──────────────────────────────────────────────────────────────
# 关键词规则测试
# ──────────────────────────────────────────────────────────────

class TestKeywordRules:
    async def test_add_and_list(self, test_db):
        rule_id = await db.add_keyword_rule("GPT", "title")
        rules = await db.get_keyword_rules()
        assert len(rules) == 1
        assert rules[0]["keyword"] == "GPT"

    async def test_toggle_rule(self, test_db):
        rule_id = await db.add_keyword_rule("Agent")
        # 初始 enabled=1，toggle 后变为 0
        new_state = await db.toggle_keyword_rule(rule_id)
        assert new_state is False
        # 再 toggle 回来
        new_state = await db.toggle_keyword_rule(rule_id)
        assert new_state is True

    async def test_delete_rule(self, test_db):
        rule_id = await db.add_keyword_rule("ToDelete")
        ok = await db.delete_keyword_rule(rule_id)
        assert ok is True
        rules = await db.get_keyword_rules()
        assert len(rules) == 0


# ──────────────────────────────────────────────────────────────
# Pipeline 执行记录测试
# ──────────────────────────────────────────────────────────────

class TestPipelineRuns:
    async def test_save_and_get(self, test_db):
        """保存并查询 Pipeline 执行记录。"""
        run_id = str(uuid.uuid4())
        await db.save_pipeline_run(
            run_id=run_id,
            started_at="2025-01-01T00:00:00Z",
            finished_at="2025-01-01T00:05:00Z",
            logs=["log 1", "log 2"],
            stats={"fetched": 10, "selected": 3},
            status="done",
        )
        runs = await db.get_pipeline_runs()
        assert len(runs) == 1
        assert runs[0]["id"] == run_id
        assert runs[0]["logs"] == ["log 1", "log 2"]
        assert runs[0]["stats"]["fetched"] == 10

    async def test_delete_run(self, test_db):
        run_id = str(uuid.uuid4())
        await db.save_pipeline_run(run_id, "2025-01-01", "2025-01-01", [], {})
        ok = await db.delete_pipeline_run(run_id)
        assert ok is True
        runs = await db.get_pipeline_runs()
        assert len(runs) == 0


# ──────────────────────────────────────────────────────────────
# 筛选预设方案测试
# ──────────────────────────────────────────────────────────────

class TestFilterPresets:
    async def test_create_and_list(self, test_db):
        await db.create_filter_preset("预设A", "只关注 Agent 相关")
        presets = await db.get_filter_presets()
        assert len(presets) == 1
        assert presets[0]["name"] == "预设A"
        assert presets[0]["is_active"] is False

    async def test_toggle_active_multi_select(self, test_db):
        """多选激活模式。"""
        id_a = await db.create_filter_preset("A", "prompt A")
        id_b = await db.create_filter_preset("B", "prompt B")

        await db.toggle_filter_preset_active(id_a)
        await db.toggle_filter_preset_active(id_b)

        active = await db.get_active_filter_presets()
        assert len(active) == 2

    async def test_activate_single_select_legacy(self, test_db):
        """单选激活模式（向后兼容）。"""
        id_a = await db.create_filter_preset("A", "prompt A")
        id_b = await db.create_filter_preset("B", "prompt B")

        await db.activate_filter_preset(id_a)
        active = await db.get_active_filter_preset()
        assert active["id"] == id_a

        await db.activate_filter_preset(id_b)
        active = await db.get_active_filter_preset()
        assert active["id"] == id_b

    async def test_deactivate_all(self, test_db):
        id_a = await db.create_filter_preset("A")
        await db.toggle_filter_preset_active(id_a)
        await db.activate_filter_preset(None)
        active = await db.get_active_filter_preset()
        assert active is None

    async def test_update_preset(self, test_db):
        preset_id = await db.create_filter_preset("Old", "old prompt")
        ok = await db.update_filter_preset(preset_id, {"name": "New", "prompt": "new prompt"})
        assert ok is True
        presets = await db.get_filter_presets()
        assert presets[0]["name"] == "New"

    async def test_delete_preset(self, test_db):
        preset_id = await db.create_filter_preset("ToDelete")
        ok = await db.delete_filter_preset(preset_id)
        assert ok is True


# ──────────────────────────────────────────────────────────────
# LLM 配置管理测试
# ──────────────────────────────────────────────────────────────

class TestLLMConfigs:
    async def test_create_and_list(self, test_db):
        await db.create_llm_config("GPT-4o", "openai", "gpt-4o", "sk-xxx", "https://api.openai.com/v1")
        configs = await db.get_llm_configs()
        assert len(configs) == 1
        assert configs[0]["name"] == "GPT-4o"
        assert configs[0]["provider"] == "openai"
        assert configs[0]["is_active"] is False

    async def test_activate_single_mode(self, test_db):
        """激活一个配置应停用其他所有。"""
        id_a = await db.create_llm_config("A")
        id_b = await db.create_llm_config("B")

        await db.activate_llm_config(id_a)
        active = await db.get_active_llm_config()
        assert active["id"] == id_a

        await db.activate_llm_config(id_b)
        active = await db.get_active_llm_config()
        assert active["id"] == id_b

    async def test_deactivate_all(self, test_db):
        id_a = await db.create_llm_config("A")
        await db.activate_llm_config(id_a)
        await db.deactivate_all_llm_configs()
        active = await db.get_active_llm_config()
        assert active is None

    async def test_update_config(self, test_db):
        config_id = await db.create_llm_config("Old", "openai", "model-old")
        ok = await db.update_llm_config(config_id, {"name": "New", "model": "model-new"})
        assert ok is True
        configs = await db.get_llm_configs()
        assert configs[0]["model"] == "model-new"

    async def test_delete_config(self, test_db):
        config_id = await db.create_llm_config("ToDelete")
        ok = await db.delete_llm_config(config_id)
        assert ok is True
        configs = await db.get_llm_configs()
        assert len(configs) == 0

    async def test_no_active_config_returns_none(self, test_db):
        active = await db.get_active_llm_config()
        assert active is None
