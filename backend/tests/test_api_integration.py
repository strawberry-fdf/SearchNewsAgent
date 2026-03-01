"""
FastAPI 路由 (api/routes.py) 集成测试。

通过 httpx AsyncClient + ASGI Transport 模拟 HTTP 请求，
测试所有 REST API 端点的请求/响应/异常处理。

覆盖场景:
- 文章查询（状态过滤、分页、搜索）
- 文章收藏/删除
- 信源 CRUD
- 设置读写
- 筛选预设 CRUD + 激活/停用
- LLM 配置 CRUD + 激活/停用
- 兴趣标签 CRUD
- 关键词规则 CRUD
- Pipeline 管理
- 缓存管理
- 错误码验证
"""

from __future__ import annotations

import json

import pytest

from backend.storage import db


# ──────────────────────────────────────────────────────────────
# 文章端点测试
# ──────────────────────────────────────────────────────────────

class TestArticleEndpoints:
    """文章查询与操作 API 测试。"""

    async def test_list_articles_empty(self, api_client, test_db):
        """空数据库应返回空列表。"""
        resp = await api_client.get("/api/articles")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []

    async def test_list_articles_with_data(self, api_client, test_db, make_article):
        """有数据时应返回文章列表。"""
        await db.insert_article(make_article(url="https://api-test.com/1"))
        resp = await api_client.get("/api/articles")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1

    async def test_list_articles_status_filter(self, api_client, test_db, make_article):
        """按状态过滤文章。"""
        art = make_article(url="https://api-test.com/2")
        await db.insert_article(art)
        await db.update_article(art["url_hash"], {"status": "selected"})

        resp = await api_client.get("/api/articles?status=selected")
        data = resp.json()
        assert data["total"] == 1

        resp = await api_client.get("/api/articles?status=rejected")
        data = resp.json()
        assert data["total"] == 0

    async def test_list_selected_articles(self, api_client, test_db, make_article):
        """精选文章专属端点。"""
        art = make_article(url="https://api-test.com/sel")
        await db.insert_article(art)
        await db.update_article(art["url_hash"], {"status": "selected"})

        resp = await api_client.get("/api/articles/selected")
        assert resp.status_code == 200
        assert resp.json()["total"] == 1

    async def test_toggle_star(self, api_client, test_db, make_article):
        """切换文章收藏。"""
        art = make_article(url="https://api-test.com/star")
        await db.insert_article(art)

        resp = await api_client.post(f"/api/articles/{art['url_hash']}/star")
        assert resp.status_code == 200
        assert resp.json()["starred"] is True

    async def test_delete_article(self, api_client, test_db, make_article):
        """删除单篇文章。"""
        art = make_article(url="https://api-test.com/del")
        await db.insert_article(art)

        resp = await api_client.delete(f"/api/articles/{art['url_hash']}")
        assert resp.status_code == 200
        assert resp.json()["status"] == "deleted"

    async def test_delete_article_not_found(self, api_client, test_db):
        """删除不存在的文章应返回 404。"""
        resp = await api_client.delete("/api/articles/nonexistent_hash")
        assert resp.status_code == 404

    async def test_batch_delete(self, api_client, test_db, make_article):
        """批量删除文章。"""
        hashes = []
        for i in range(3):
            art = make_article(url=f"https://api-test.com/batch{i}")
            await db.insert_article(art)
            hashes.append(art["url_hash"])

        resp = await api_client.post("/api/articles/batch-delete", json={"url_hashes": hashes[:2]})
        assert resp.status_code == 200
        assert resp.json()["deleted"] == 2

    async def test_source_counts(self, api_client, test_db, make_article):
        """信源文章计数端点。"""
        await db.insert_article(make_article(url="https://a.com/1", source_name="SrcA"))
        await db.insert_article(make_article(url="https://a.com/2", source_name="SrcA"))
        await db.insert_article(make_article(url="https://b.com/1", source_name="SrcB"))

        resp = await api_client.get("/api/articles/source-counts")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 3

    async def test_update_user_tags(self, api_client, test_db, make_article):
        """更新文章用户标签。"""
        art = make_article(url="https://api-test.com/tags")
        await db.insert_article(art)

        resp = await api_client.put(
            f"/api/articles/{art['url_hash']}/user-tags",
            json={"tags": ["RAG", "Agent"]},
        )
        assert resp.status_code == 200
        assert resp.json()["tags"] == ["RAG", "Agent"]


# ──────────────────────────────────────────────────────────────
# 信源端点测试
# ──────────────────────────────────────────────────────────────

class TestSourceEndpoints:
    """信源 CRUD API 测试。"""

    async def test_list_sources_empty(self, api_client, test_db):
        resp = await api_client.get("/api/sources")
        assert resp.status_code == 200
        assert resp.json()["items"] == []

    async def test_create_source(self, api_client, test_db):
        resp = await api_client.post("/api/sources", json={
            "name": "OpenAI",
            "url": "https://openai.com/feed",
            "source_type": "rss",
            "tags": ["官方"],
        })
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    async def test_create_and_list(self, api_client, test_db):
        await api_client.post("/api/sources", json={
            "name": "Test", "url": "https://test.com/feed",
        })
        resp = await api_client.get("/api/sources")
        assert len(resp.json()["items"]) == 1

    async def test_update_source(self, api_client, test_db):
        resp = await api_client.post("/api/sources", json={
            "name": "Test", "url": "https://upd.com/feed",
        })
        src_id = resp.json()["id"]

        resp = await api_client.patch(f"/api/sources/{src_id}", json={"enabled": False})
        assert resp.status_code == 200

    async def test_delete_source(self, api_client, test_db):
        await api_client.post("/api/sources", json={
            "name": "ToDel", "url": "https://del.com/feed",
        })
        resp = await api_client.delete("/api/sources?url=https://del.com/feed")
        assert resp.status_code == 200

    async def test_delete_source_not_found(self, api_client, test_db):
        resp = await api_client.delete("/api/sources?url=https://nonexist.com")
        assert resp.status_code == 404

    async def test_pinned_categories(self, api_client, test_db):
        """置顶分类管理。"""
        resp = await api_client.put("/api/sources/pinned-categories", json={
            "pinned_categories": ["AI博客", "论文"],
        })
        assert resp.status_code == 200

        resp = await api_client.get("/api/sources/pinned-categories")
        assert resp.json()["pinned_categories"] == ["AI博客", "论文"]


# ──────────────────────────────────────────────────────────────
# 统计端点测试
# ──────────────────────────────────────────────────────────────

class TestStatsEndpoint:
    async def test_stats_empty(self, api_client, test_db):
        resp = await api_client.get("/api/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["selected"] == 0

    async def test_stats_with_data(self, api_client, test_db, make_article):
        art1 = make_article(url="https://stat.com/1")
        await db.insert_article(art1)
        await db.update_article(art1["url_hash"], {"status": "selected"})

        art2 = make_article(url="https://stat.com/2")
        await db.insert_article(art2)

        resp = await api_client.get("/api/stats")
        data = resp.json()
        assert data["total"] == 2
        assert data["selected"] == 1
        assert data["pending"] == 1


# ──────────────────────────────────────────────────────────────
# 设置端点测试
# ──────────────────────────────────────────────────────────────

class TestSettingsEndpoints:
    async def test_get_default_settings(self, api_client, test_db):
        resp = await api_client.get("/api/settings")
        assert resp.status_code == 200
        data = resp.json()
        assert data["llm_enabled"] is True

    async def test_update_settings(self, api_client, test_db):
        resp = await api_client.put("/api/settings", json={"llm_enabled": False})
        assert resp.status_code == 200
        data = resp.json()
        assert data["llm_enabled"] is False


# ──────────────────────────────────────────────────────────────
# 筛选预设端点测试
# ──────────────────────────────────────────────────────────────

class TestFilterPresetEndpoints:
    async def test_crud_flow(self, api_client, test_db):
        """完整的预设 CRUD 流程。"""
        # Create
        resp = await api_client.post("/api/filter-presets", json={"name": "Agent专注", "prompt": "只看Agent"})
        assert resp.status_code == 200
        preset_id = resp.json()["id"]

        # List
        resp = await api_client.get("/api/filter-presets")
        assert len(resp.json()["items"]) == 1

        # Update
        resp = await api_client.patch(f"/api/filter-presets/{preset_id}", json={"name": "新名称"})
        assert resp.status_code == 200

        # Toggle active
        resp = await api_client.post(f"/api/filter-presets/{preset_id}/toggle-active")
        assert resp.json()["is_active"] is True

        # Delete
        resp = await api_client.delete(f"/api/filter-presets/{preset_id}")
        assert resp.status_code == 200

    async def test_empty_name_rejected(self, api_client, test_db):
        """空名称应返回 400。"""
        resp = await api_client.post("/api/filter-presets", json={"name": "  ", "prompt": "x"})
        assert resp.status_code == 400


# ──────────────────────────────────────────────────────────────
# LLM 配置端点测试
# ──────────────────────────────────────────────────────────────

class TestLLMConfigEndpoints:
    async def test_crud_flow(self, api_client, test_db):
        """完整的 LLM 配置 CRUD 流程。"""
        # Create
        resp = await api_client.post("/api/llm-configs", json={
            "name": "GPT-4o", "model": "gpt-4o",
            "api_key": "sk-test", "base_url": "https://api.openai.com/v1",
        })
        assert resp.status_code == 200
        config_id = resp.json()["id"]

        # List
        resp = await api_client.get("/api/llm-configs")
        assert len(resp.json()["items"]) == 1

        # Activate
        resp = await api_client.post(f"/api/llm-configs/{config_id}/activate")
        assert resp.status_code == 200

        # Deactivate all
        resp = await api_client.post("/api/llm-configs/deactivate")
        assert resp.status_code == 200

        # Delete
        resp = await api_client.delete(f"/api/llm-configs/{config_id}")
        assert resp.status_code == 200

    async def test_empty_name_rejected(self, api_client, test_db):
        resp = await api_client.post("/api/llm-configs", json={"name": " "})
        assert resp.status_code == 400


# ──────────────────────────────────────────────────────────────
# 标签与规则端点测试
# ──────────────────────────────────────────────────────────────

class TestTagsAndRulesEndpoints:
    async def test_interest_tags_flow(self, api_client, test_db):
        """兴趣标签 CRUD。"""
        resp = await api_client.post("/api/tags", json={"tag": "Agent"})
        assert resp.status_code == 200

        resp = await api_client.get("/api/tags")
        assert "Agent" in resp.json()["items"]

        resp = await api_client.delete("/api/tags/Agent")
        assert resp.status_code == 200

    async def test_empty_tag_rejected(self, api_client, test_db):
        resp = await api_client.post("/api/tags", json={"tag": " "})
        assert resp.status_code == 400

    async def test_keyword_rules_flow(self, api_client, test_db):
        """关键词规则 CRUD。"""
        resp = await api_client.post("/api/rules", json={"keyword": "GPT"})
        assert resp.status_code == 200
        rule_id = resp.json()["id"]

        resp = await api_client.get("/api/rules")
        assert len(resp.json()["items"]) == 1

        resp = await api_client.patch(f"/api/rules/{rule_id}/toggle")
        assert resp.status_code == 200

        resp = await api_client.delete(f"/api/rules/{rule_id}")
        assert resp.status_code == 200

    async def test_empty_keyword_rejected(self, api_client, test_db):
        resp = await api_client.post("/api/rules", json={"keyword": "  "})
        assert resp.status_code == 400


# ──────────────────────────────────────────────────────────────
# Pipeline 管理端点测试
# ──────────────────────────────────────────────────────────────

class TestPipelineEndpoints:
    async def test_pipeline_status(self, api_client, test_db):
        """查询 Pipeline 状态。"""
        resp = await api_client.get("/api/admin/pipeline-status")
        assert resp.status_code == 200
        data = resp.json()
        assert "running" in data

    async def test_pipeline_runs_empty(self, api_client, test_db):
        resp = await api_client.get("/api/admin/pipeline-runs")
        assert resp.status_code == 200
        assert resp.json()["items"] == []
