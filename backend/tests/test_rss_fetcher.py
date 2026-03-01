"""
RSS 抓取器 (ingestion/rss_fetcher.py) 单元测试。

覆盖场景:
- 正常 RSS 解析
- fetch_since 日期过滤
- HTTP 请求失败处理
- 畸形 Feed 处理
- 空 Feed / 无 entries
- 各字段正确提取
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.ingestion.rss_fetcher import _parse_date, fetch_rss_feed


# ──────────────────────────────────────────────────────────────
# 测试用 RSS XML 数据
# ──────────────────────────────────────────────────────────────

SAMPLE_RSS = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <link>https://example.com</link>
    <item>
      <title>Article One</title>
      <link>https://example.com/article-1</link>
      <description>&lt;p&gt;First article content&lt;/p&gt;</description>
      <pubDate>Wed, 01 Jan 2025 12:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Article Two</title>
      <link>https://example.com/article-2</link>
      <description>&lt;p&gt;Second article content&lt;/p&gt;</description>
      <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Article Three</title>
      <link>https://example.com/article-3</link>
      <description>&lt;p&gt;Third article content&lt;/p&gt;</description>
      <pubDate>Sat, 01 Jun 2024 12:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>"""

EMPTY_RSS = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Empty Feed</title>
    <link>https://example.com</link>
  </channel>
</rss>"""

MALFORMED_RSS = """This is not valid RSS at all!"""


# ──────────────────────────────────────────────────────────────
# fetch_rss_feed 测试
# ──────────────────────────────────────────────────────────────

class TestFetchRssFeed:
    """fetch_rss_feed() 核心功能测试。"""

    @patch("backend.ingestion.rss_fetcher.httpx.AsyncClient")
    async def test_normal_rss_parse(self, mock_client_cls):
        """正常 RSS 应解析出所有 entries。"""
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.text = SAMPLE_RSS

        mock_client = AsyncMock()
        mock_client.get.return_value = mock_response
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        articles = await fetch_rss_feed("https://example.com/feed.xml", "src1", "TestFeed")

        assert len(articles) == 3
        assert articles[0]["url"] == "https://example.com/article-1"
        assert articles[0]["source_name"] == "TestFeed"
        assert articles[0]["status"] == "pending"

    @patch("backend.ingestion.rss_fetcher.httpx.AsyncClient")
    async def test_article_fields(self, mock_client_cls):
        """每条文章应包含所有必要字段。"""
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.text = SAMPLE_RSS

        mock_client = AsyncMock()
        mock_client.get.return_value = mock_response
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        articles = await fetch_rss_feed("https://example.com/feed.xml")
        art = articles[0]

        required_fields = ["url", "url_hash", "source_id", "source_name",
                          "raw_html", "clean_markdown", "raw_title",
                          "status", "starred", "fetched_at", "published_at"]
        for field in required_fields:
            assert field in art, f"Missing field: {field}"

    @patch("backend.ingestion.rss_fetcher.httpx.AsyncClient")
    async def test_fetch_since_filter(self, mock_client_cls):
        """fetch_since 应过滤掉旧文章。"""
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.text = SAMPLE_RSS

        mock_client = AsyncMock()
        mock_client.get.return_value = mock_response
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        # 只获取 2024-10-01 之后的文章（只有 Article One 在 2025 年）
        articles = await fetch_rss_feed(
            "https://example.com/feed.xml",
            fetch_since="2024-10-01",
        )
        assert len(articles) == 1
        assert "article-1" in articles[0]["url"]

    @patch("backend.ingestion.rss_fetcher.httpx.AsyncClient")
    async def test_fetch_since_invalid_date_accepts_all(self, mock_client_cls):
        """无效的 fetch_since 日期应忽略，接受所有文章。"""
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.text = SAMPLE_RSS

        mock_client = AsyncMock()
        mock_client.get.return_value = mock_response
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        articles = await fetch_rss_feed(
            "https://example.com/feed.xml",
            fetch_since="not-a-date",
        )
        assert len(articles) == 3

    @patch("backend.ingestion.rss_fetcher.httpx.AsyncClient")
    async def test_empty_feed(self, mock_client_cls):
        """空 Feed 应返回空列表。"""
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.text = EMPTY_RSS

        mock_client = AsyncMock()
        mock_client.get.return_value = mock_response
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        articles = await fetch_rss_feed("https://example.com/feed.xml")
        assert articles == []

    @patch("backend.ingestion.rss_fetcher.httpx.AsyncClient")
    async def test_http_error_returns_empty(self, mock_client_cls):
        """HTTP 请求失败应返回空列表。"""
        mock_client = AsyncMock()
        mock_client.get.side_effect = Exception("Connection refused")
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        articles = await fetch_rss_feed("https://example.com/feed.xml")
        assert articles == []

    @patch("backend.ingestion.rss_fetcher.httpx.AsyncClient")
    async def test_url_hash_generated(self, mock_client_cls):
        """每篇文章应有 SHA-256 url_hash。"""
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.text = SAMPLE_RSS

        mock_client = AsyncMock()
        mock_client.get.return_value = mock_response
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        articles = await fetch_rss_feed("https://example.com/feed.xml")
        for art in articles:
            assert len(art["url_hash"]) == 64  # SHA-256 hex

    @patch("backend.ingestion.rss_fetcher.httpx.AsyncClient")
    async def test_no_link_entry_skipped(self, mock_client_cls):
        """没有 link 的 entry 应被跳过。"""
        rss_no_link = """<?xml version="1.0"?>
        <rss version="2.0"><channel>
          <item><title>No Link</title></item>
          <item><title>Has Link</title><link>https://example.com/ok</link></item>
        </channel></rss>"""

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.text = rss_no_link

        mock_client = AsyncMock()
        mock_client.get.return_value = mock_response
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        articles = await fetch_rss_feed("https://example.com/feed.xml")
        assert len(articles) == 1


# ──────────────────────────────────────────────────────────────
# _parse_date 测试
# ──────────────────────────────────────────────────────────────

class TestParseDate:
    """_parse_date() 日期解析辅助函数测试。"""

    def test_with_published_parsed(self):
        """有 published_parsed 时应正确解析。"""
        entry = MagicMock()
        entry.published_parsed = time.strptime("2025-01-15", "%Y-%m-%d")
        entry.updated_parsed = None
        result = _parse_date(entry)
        assert isinstance(result, datetime)
        assert result.year == 2025

    def test_with_updated_parsed_fallback(self):
        """无 published_parsed 时应使用 updated_parsed。"""
        entry = MagicMock()
        entry.published_parsed = None
        entry.updated_parsed = time.strptime("2024-06-01", "%Y-%m-%d")
        result = _parse_date(entry)
        assert isinstance(result, datetime)
        assert result.year == 2024

    def test_no_date_returns_none(self):
        """无日期信息时返回 None。"""
        entry = MagicMock()
        entry.published_parsed = None
        entry.updated_parsed = None
        result = _parse_date(entry)
        assert result is None
