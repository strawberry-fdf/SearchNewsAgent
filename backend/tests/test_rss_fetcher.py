"""
RSS/Atom/JSON Feed 抓取器 (ingestion/rss_fetcher.py) 单元测试。

覆盖场景:
- 正常 RSS 解析
- fetch_since 日期过滤
- fetch_since + 无日期条目（应放行而非跳过）
- HTTP 请求失败处理
- 畸形 Feed 处理
- 空 Feed / 无 entries
- 各字段正确提取
- JSON Feed 1.0/1.1 解析
- 不限制条目数量
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.ingestion.rss_fetcher import (
    _is_json_feed,
    _parse_date,
    _parse_iso_date,
    _parse_json_feed,
    fetch_rss_feed,
)


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
        entry.published = None
        entry.updated = None
        result = _parse_date(entry)
        assert result is None

    def test_fallback_to_iso_string(self):
        """当 parsed 字段为空但 ISO 字符串存在时应解析成功。"""
        entry = MagicMock()
        entry.published_parsed = None
        entry.updated_parsed = None
        entry.published = "2025-03-01T10:00:00Z"
        entry.updated = None
        result = _parse_date(entry)
        assert isinstance(result, datetime)
        assert result.year == 2025
        assert result.month == 3


# ──────────────────────────────────────────────────────────────
# fetch_since + 无日期条目测试
# ──────────────────────────────────────────────────────────────

class TestFetchSinceUndatedEntries:
    """fetch_since 设置后，无日期的条目应被保留而不是跳过。"""

    UNDATED_RSS = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Undated Feed</title>
    <item>
      <title>No Date Article</title>
      <link>https://example.com/no-date</link>
      <description>Content without date</description>
    </item>
    <item>
      <title>Old Article</title>
      <link>https://example.com/old</link>
      <description>Old content</description>
      <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
    </item>
    <item>
      <title>New Article</title>
      <link>https://example.com/new</link>
      <description>New content</description>
      <pubDate>Wed, 01 Jan 2025 12:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>"""

    @patch("backend.ingestion.rss_fetcher.httpx.AsyncClient")
    async def test_undated_entry_included_with_fetch_since(self, mock_client_cls):
        """fetch_since 设置时，无日期条目应被保留（无法确定其为旧条目）。"""
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.text = self.UNDATED_RSS
        mock_response.headers = {"content-type": "application/xml"}

        mock_client = AsyncMock()
        mock_client.get.return_value = mock_response
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        articles = await fetch_rss_feed(
            "https://example.com/feed.xml",
            fetch_since="2024-10-01",
        )
        urls = [a["url"] for a in articles]
        # Should include: no-date (undated → included) + new (after cutoff)
        # Should exclude: old (before cutoff)
        assert "https://example.com/no-date" in urls
        assert "https://example.com/new" in urls
        assert "https://example.com/old" not in urls
        assert len(articles) == 2


# ──────────────────────────────────────────────────────────────
# 不限制条目数量测试
# ──────────────────────────────────────────────────────────────

class TestNoEntryLimit:
    """不应硬性截断 feed 条目数。"""

    @patch("backend.ingestion.rss_fetcher.httpx.AsyncClient")
    async def test_more_than_30_entries_all_parsed(self, mock_client_cls):
        """超过 30 条的 feed 应全部解析。"""
        items = ""
        for i in range(50):
            items += f"""<item>
              <title>Article {i}</title>
              <link>https://example.com/article-{i}</link>
              <description>Content {i}</description>
            </item>\n"""
        big_rss = f"""<?xml version="1.0"?>
        <rss version="2.0"><channel><title>Big Feed</title>{items}</channel></rss>"""

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.text = big_rss
        mock_response.headers = {"content-type": "application/xml"}

        mock_client = AsyncMock()
        mock_client.get.return_value = mock_response
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        articles = await fetch_rss_feed("https://example.com/feed.xml")
        assert len(articles) == 50


# ──────────────────────────────────────────────────────────────
# JSON Feed 解析测试
# ──────────────────────────────────────────────────────────────

SAMPLE_JSON_FEED = json.dumps({
    "version": "https://jsonfeed.org/version/1.1",
    "title": "My JSON Feed",
    "items": [
        {
            "id": "1",
            "url": "https://example.com/json-article-1",
            "title": "JSON Article One",
            "content_html": "<p>First JSON content</p>",
            "date_published": "2025-01-15T12:00:00Z",
        },
        {
            "id": "2",
            "url": "https://example.com/json-article-2",
            "title": "JSON Article Two",
            "content_text": "Second article text",
            "date_published": "2024-06-01T12:00:00Z",
        },
        {
            "id": "3",
            "url": "https://example.com/json-article-3",
            "title": "JSON Article Three (no date)",
            "summary": "Summary only",
        },
    ],
})


class TestJsonFeedDetection:
    """_is_json_feed() 检测测试。"""

    def test_detect_json_feed_by_version(self):
        assert _is_json_feed(SAMPLE_JSON_FEED, "application/json") is True

    def test_detect_json_feed_by_content_type(self):
        assert _is_json_feed(SAMPLE_JSON_FEED, "application/feed+json") is True

    def test_detect_json_feed_wrong_content_type_but_version_url(self):
        assert _is_json_feed(SAMPLE_JSON_FEED, "text/html") is True

    def test_reject_rss_xml(self):
        assert _is_json_feed(SAMPLE_RSS, "application/xml") is False

    def test_reject_empty(self):
        assert _is_json_feed("", "text/plain") is False


class TestJsonFeedParsing:
    """JSON Feed 解析功能测试。"""

    def test_parse_all_items(self):
        articles = _parse_json_feed(SAMPLE_JSON_FEED, "src1", "TestJSON", None)
        assert len(articles) == 3
        assert articles[0]["url"] == "https://example.com/json-article-1"
        assert articles[0]["raw_title"] == "JSON Article One"
        assert articles[0]["status"] == "pending"

    def test_json_feed_fields(self):
        articles = _parse_json_feed(SAMPLE_JSON_FEED, "src1", "TestJSON", None)
        art = articles[0]
        required_fields = ["url", "url_hash", "source_id", "source_name",
                          "raw_html", "clean_markdown", "raw_title",
                          "status", "starred", "fetched_at", "published_at"]
        for field in required_fields:
            assert field in art, f"Missing field: {field}"

    def test_json_feed_content_html(self):
        articles = _parse_json_feed(SAMPLE_JSON_FEED, "src1", "TestJSON", None)
        assert "<p>First JSON content</p>" in articles[0]["raw_html"]

    def test_json_feed_content_text_fallback(self):
        articles = _parse_json_feed(SAMPLE_JSON_FEED, "src1", "TestJSON", None)
        assert "Second article text" in articles[1]["clean_markdown"]

    def test_json_feed_fetch_since_filter(self):
        cutoff = datetime(2024, 10, 1, tzinfo=timezone.utc)
        articles = _parse_json_feed(SAMPLE_JSON_FEED, "src1", "TestJSON", cutoff)
        urls = [a["url"] for a in articles]
        # Article 1 (2025) + Article 3 (no date → included)
        assert "https://example.com/json-article-1" in urls
        assert "https://example.com/json-article-3" in urls  # no date → included
        assert "https://example.com/json-article-2" not in urls  # 2024-06 < cutoff

    def test_json_feed_date_parsing(self):
        articles = _parse_json_feed(SAMPLE_JSON_FEED, "src1", "TestJSON", None)
        assert articles[0]["published_at"] is not None
        assert articles[0]["published_at"].year == 2025
        assert articles[2]["published_at"] is None  # no date

    @patch("backend.ingestion.rss_fetcher.httpx.AsyncClient")
    async def test_fetch_rss_feed_with_json_feed(self, mock_client_cls):
        """fetch_rss_feed 应自动检测并解析 JSON Feed。"""
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.text = SAMPLE_JSON_FEED
        mock_response.headers = {"content-type": "application/feed+json; charset=utf-8"}

        mock_client = AsyncMock()
        mock_client.get.return_value = mock_response
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        articles = await fetch_rss_feed("https://example.com/feed.json", "src1", "JSONTest")
        assert len(articles) == 3
        assert articles[0]["source_name"] == "JSONTest"


class TestParseIsoDate:
    """_parse_iso_date() ISO 日期解析测试。"""

    def test_utc_z_suffix(self):
        result = _parse_iso_date("2025-01-15T12:00:00Z")
        assert result is not None
        assert result.year == 2025
        assert result.tzinfo is not None

    def test_with_offset(self):
        result = _parse_iso_date("2025-01-15T12:00:00+08:00")
        assert result is not None
        assert result.year == 2025

    def test_no_timezone(self):
        """无时区的 ISO 日期应默认为 UTC。"""
        result = _parse_iso_date("2025-01-15T12:00:00")
        assert result is not None
        assert result.tzinfo == timezone.utc

    def test_none_returns_none(self):
        assert _parse_iso_date(None) is None

    def test_invalid_returns_none(self):
        assert _parse_iso_date("not-a-date") is None
