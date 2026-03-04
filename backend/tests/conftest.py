"""
全局测试 Fixtures —— 提供数据库隔离、测试数据工厂、Mock 对象等公共基础设施。

每个测试用例使用独立的内存 SQLite 数据库，确保测试互不干扰。
"""

from __future__ import annotations

import asyncio
import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List
from unittest.mock import AsyncMock, MagicMock, patch

import aiosqlite
import pytest
import pytest_asyncio

# 强制使用测试环境配置
os.environ.setdefault("SQLITE_DB_PATH", ":memory:")
os.environ.setdefault("LLM_PROVIDER", "openai")
os.environ.setdefault("OPENAI_API_KEY", "test-key-fake")
os.environ.setdefault("OPENAI_MODEL", "gpt-4o-mini")
os.environ.setdefault("OPENAI_BASE_URL", "https://api.openai.com/v1")
os.environ.setdefault("FEISHU_WEBHOOK_URL", "")
os.environ.setdefault("FEISHU_WEBHOOK_SECRET", "")


# ──────────────────────────────────────────────────────────────
# Event loop fixture（pytest-asyncio 需要）
# ──────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def event_loop():
    """为整个测试会话创建共享的事件循环。"""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


# ──────────────────────────────────────────────────────────────
# 独立内存 DB fixture（每个测试用例独享）
# ──────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def test_db():
    """
    提供一个独立的内存 SQLite 连接，自动执行 schema 初始化。
    测试结束后自动关闭连接。
    """
    from backend.storage import db as db_module

    # 保存原始连接池引用
    original_pool = db_module._db_pool

    # 创建内存数据库连接
    conn = await aiosqlite.connect(":memory:")
    conn.row_factory = aiosqlite.Row
    await db_module._init_schema(conn)

    # 替换全局连接
    db_module._db_pool = conn

    yield conn

    # 恢复原始连接池
    await conn.close()
    db_module._db_pool = original_pool


# ──────────────────────────────────────────────────────────────
# 数据工厂 Fixtures
# ──────────────────────────────────────────────────────────────

@pytest.fixture
def make_source():
    """信源数据工厂：生成测试用信源 dict。"""
    def _factory(
        name: str = "TestSource",
        url: str = "https://example.com/feed.xml",
        source_type: str = "rss",
        tags: List[str] | None = None,
        enabled: bool = True,
        category: str = "",
        fetch_since: str | None = None,
        fetch_interval_minutes: int = 30,
    ) -> Dict[str, Any]:
        return {
            "name": name,
            "url": url,
            "source_type": source_type,
            "tags": tags or [],
            "enabled": enabled,
            "fetch_interval_minutes": fetch_interval_minutes,
            "category": category,
            "fetch_since": fetch_since,
        }
    return _factory


@pytest.fixture
def make_article():
    """文章数据工厂：生成测试用文章 dict（与 insert_article 兼容）。"""
    def _factory(
        url: str | None = None,
        url_hash: str | None = None,
        source_id: str | None = None,
        source_name: str = "TestSource",
        raw_html: str = "<p>Test content</p>",
        clean_markdown: str = "Test content",
        raw_title: str = "Test Article Title",
        status: str = "pending",
        rejection_reason: str = "",
        starred: bool = False,
        published_at: datetime | None = None,
    ) -> Dict[str, Any]:
        _url = url or f"https://example.com/article/{uuid.uuid4().hex[:8]}"
        from backend.ingestion.dedup import url_hash as compute_hash
        _hash = url_hash or compute_hash(_url)
        return {
            "url": _url,
            "url_hash": _hash,
            "source_id": source_id,
            "source_name": source_name,
            "raw_html": raw_html,
            "clean_markdown": clean_markdown,
            "raw_title": raw_title,
            "status": status,
            "rejection_reason": rejection_reason,
            "starred": starred,
            "fetched_at": datetime.now(timezone.utc),
            "published_at": published_at,
            "analysis": None,
        }
    return _factory


@pytest.fixture
def make_analysis():
    """LLM 分析结果工厂：生成测试用 analysis dict。"""
    def _factory(
        title: str = "AI 新突破",
        summary: str = "这是一个重要的AI技术突破",
        category: str = "模型发布",
        ai_relevance: int = 85,
        importance: int = 90,
        model_selected: bool = True,
        tags: List[str] | None = None,
    ) -> Dict[str, Any]:
        return {
            "title": title,
            "summary": summary,
            "category": category,
            "ai_relevance": ai_relevance,
            "importance": importance,
            "model_selected": model_selected,
            "tags": tags or ["AI", "大模型"],
        }
    return _factory


# ──────────────────────────────────────────────────────────────
# FastAPI TestClient fixture
# ──────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def api_client(test_db):
    """提供 httpx AsyncClient 用于 FastAPI 路由测试。"""
    from httpx import ASGITransport, AsyncClient
    from fastapi import FastAPI
    from backend.api.routes import router

    app = FastAPI()
    app.include_router(router)

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        yield client


# ──────────────────────────────────────────────────────────────
# Mock LLM 响应
# ──────────────────────────────────────────────────────────────

@pytest.fixture
def mock_llm_response():
    """返回一个标准的 LLM JSON 响应字符串。"""
    def _factory(
        title: str = "AI 新突破",
        summary: str = "重要的AI技术进展",
        category: str = "模型发布",
        ai_relevance: int = 85,
        importance: int = 90,
        model_selected: bool = True,
        tags: List[str] | None = None,
    ) -> str:
        return json.dumps({
            "title": title,
            "summary": summary,
            "category": category,
            "ai_relevance": ai_relevance,
            "importance": importance,
            "model_selected": model_selected,
            "tags": tags or ["AI", "大模型"],
        }, ensure_ascii=False)
    return _factory
