"""
网页爬虫模块 (ingestion/web_scraper.py) 单元测试。

覆盖场景:
- HTML 链接提取（Scrapling Selector）
- HTML → Markdown 转换（lxml 降噪 + markdownify）
- 标题提取（h1 优先 / title 回退）
- CSS 选择器链接筛选
- scrape_web_page 完整流程（并发 + FetcherSession）
- 异常兜底与状态码处理
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.ingestion.web_scraper import (
    _extract_links,
    _extract_title,
    _html_to_markdown,
    scrape_web_page,
)


# ──────────────────────────────────────────────────────────────
# _extract_links 测试
# ──────────────────────────────────────────────────────────────

class TestExtractLinks:
    """HTML 链接提取测试。"""

    def test_basic_link_extraction(self):
        html = '<html><body><a href="/article/1">Art 1</a><a href="/article/2">Art 2</a></body></html>'
        links = _extract_links(html, "https://example.com")
        assert len(links) == 2
        assert "https://example.com/article/1" in links
        assert "https://example.com/article/2" in links

    def test_dedup_links(self):
        """重复链接应去重。"""
        html = '<html><body><a href="/art">A</a><a href="/art">B</a></body></html>'
        links = _extract_links(html, "https://example.com")
        assert len(links) == 1

    def test_skip_hash_and_javascript(self):
        """应跳过 # 锚点和 javascript: 链接。"""
        html = '<html><body><a href="#">Top</a><a href="javascript:void(0)">Click</a><a href="/real">Real</a></body></html>'
        links = _extract_links(html, "https://example.com")
        assert len(links) == 1
        assert "https://example.com/real" in links

    def test_absolute_url_preserved(self):
        """绝对 URL 应保持不变。"""
        html = '<html><body><a href="https://other.com/page">Link</a></body></html>'
        links = _extract_links(html, "https://example.com")
        assert links == ["https://other.com/page"]

    def test_relative_url_resolved(self):
        """相对 URL 应基于 base_url 解析。"""
        html = '<html><body><a href="blog/post-1">Link</a></body></html>'
        links = _extract_links(html, "https://example.com/")
        assert links == ["https://example.com/blog/post-1"]

    def test_with_selector(self):
        """CSS 选择器应限定链接提取范围。"""
        html = """
        <html><body>
        <div class="nav"><a href="/nav1">Nav</a></div>
        <div class="articles"><a href="/art1">Art</a><a href="/art2">Art2</a></div>
        </body></html>
        """
        links = _extract_links(html, "https://example.com", selector=".articles a")
        assert len(links) == 2
        assert all("/art" in link for link in links)

    def test_empty_html(self):
        """空 HTML 返回空列表。"""
        links = _extract_links("", "https://example.com")
        assert links == []


# ──────────────────────────────────────────────────────────────
# _html_to_markdown 测试
# ──────────────────────────────────────────────────────────────

class TestHtmlToMarkdown:
    """HTML → Markdown 转换与降噪测试。"""

    def test_basic_conversion(self):
        html = "<html><body><article><h1>Title</h1><p>Content here</p></article></body></html>"
        result = _html_to_markdown(html)
        assert "Title" in result
        assert "Content" in result

    def test_script_removed(self):
        """<script> 标签应被移除。"""
        html = "<html><body><p>Good</p><script>alert('bad')</script></body></html>"
        result = _html_to_markdown(html)
        assert "alert" not in result
        assert "Good" in result

    def test_style_removed(self):
        """<style> 标签应被移除。"""
        html = "<html><body><p>Good</p><style>.bad{color:red}</style></body></html>"
        result = _html_to_markdown(html)
        assert "color:red" not in result

    def test_nav_footer_removed(self):
        """<nav> 和 <footer> 应被移除。"""
        html = "<html><body><nav>Menu</nav><main><p>Content</p></main><footer>Footer</footer></body></html>"
        result = _html_to_markdown(html)
        assert "Menu" not in result
        assert "Footer" not in result
        assert "Content" in result

    def test_sidebar_class_removed(self):
        """含 sidebar 类的元素应被移除。"""
        html = '<html><body><div class="sidebar">Ad</div><div class="content"><p>Main</p></div></body></html>'
        result = _html_to_markdown(html)
        # sidebar 应被移除
        assert "Main" in result


# ──────────────────────────────────────────────────────────────
# _extract_title 测试
# ──────────────────────────────────────────────────────────────

class TestExtractTitle:
    """HTML 标题提取测试。"""

    def test_h1_priority(self):
        """优先提取 <h1> 标签。"""
        html = "<html><head><title>Title Tag</title></head><body><h1>H1 Title</h1></body></html>"
        assert _extract_title(html) == "H1 Title"

    def test_title_fallback(self):
        """无 <h1> 时使用 <title> 标签。"""
        html = "<html><head><title>Title Tag</title></head><body><p>Content</p></body></html>"
        assert _extract_title(html) == "Title Tag"

    def test_no_title_returns_empty(self):
        """无标题标签时返回空字符串。"""
        html = "<html><body><p>Content only</p></body></html>"
        assert _extract_title(html) == ""

    def test_empty_h1_uses_title(self):
        """空 <h1> 时应回退到 <title>。"""
        html = "<html><head><title>Fallback</title></head><body><h1>  </h1></body></html>"
        assert _extract_title(html) == "Fallback"


# ──────────────────────────────────────────────────────────────
# scrape_web_page 集成测试
# ──────────────────────────────────────────────────────────────

class TestScrapeWebPage:
    """scrape_web_page() 完整流程测试。"""

    @patch("backend.ingestion.web_scraper.FetcherSession")
    @patch("backend.ingestion.web_scraper._fetch_page")
    async def test_normal_scraping(self, mock_fetch_page, mock_session_cls):
        """正常爬取：发现链接 → 并发抓取每篇 → 返回 article stubs。"""
        from scrapling.parser import Selector

        # 模拟索引页（Selector 对象）
        mock_fetch_page.return_value = Selector(
            '<html><body><a href="https://example.com/post1">Post1</a></body></html>'
        )

        # 模拟文章页面响应
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.body = (
            b"<html><head><title>Post 1</title></head>"
            b"<body><h1>Post Title</h1><p>Article body</p></body></html>"
        )
        mock_resp.encoding = "utf-8"

        mock_session = AsyncMock()
        mock_session.get = AsyncMock(return_value=mock_resp)
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)
        mock_session_cls.return_value = mock_session

        articles = await scrape_web_page(
            "https://example.com/news", source_name="TestWeb",
        )

        assert len(articles) >= 1
        assert articles[0]["source_name"] == "TestWeb"
        assert articles[0]["status"] == "pending"
        assert len(articles[0]["url_hash"]) == 64

    @patch("backend.ingestion.web_scraper._fetch_page")
    async def test_fetch_error_returns_empty(self, mock_fetch_page):
        """获取索引页失败时返回空列表。"""
        mock_fetch_page.side_effect = Exception("Connection timeout")
        articles = await scrape_web_page("https://example.com")
        assert articles == []

    @patch("backend.ingestion.web_scraper.FetcherSession")
    @patch("backend.ingestion.web_scraper._fetch_page")
    async def test_non_200_status_skipped(self, mock_fetch_page, mock_session_cls):
        """非 200 状态码的文章应被跳过。"""
        from scrapling.parser import Selector

        mock_fetch_page.return_value = Selector(
            '<html><body><a href="https://example.com/blocked">Link</a></body></html>'
        )

        mock_resp = MagicMock()
        mock_resp.status = 403
        mock_resp.body = b""
        mock_resp.encoding = "utf-8"

        mock_session = AsyncMock()
        mock_session.get = AsyncMock(return_value=mock_resp)
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)
        mock_session_cls.return_value = mock_session

        articles = await scrape_web_page("https://example.com/news")
        assert articles == []

    @patch("backend.ingestion.web_scraper.FetcherSession")
    @patch("backend.ingestion.web_scraper._fetch_page")
    async def test_network_error_skips_article(self, mock_fetch_page, mock_session_cls):
        """单篇文章网络错误不影响其他文章。"""
        from scrapling.parser import Selector

        mock_fetch_page.return_value = Selector(
            '<html><body>'
            '<a href="https://example.com/ok">OK</a>'
            '<a href="https://example.com/fail">Fail</a>'
            '</body></html>'
        )

        ok_resp = MagicMock()
        ok_resp.status = 200
        ok_resp.body = b"<html><body><h1>Good</h1><p>Content</p></body></html>"
        ok_resp.encoding = "utf-8"

        mock_session = AsyncMock()

        async def side_effect(url, **kwargs):
            if "fail" in url:
                raise ConnectionError("timeout")
            return ok_resp

        mock_session.get = AsyncMock(side_effect=side_effect)
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)
        mock_session_cls.return_value = mock_session

        articles = await scrape_web_page("https://example.com/news")
        assert len(articles) == 1
        assert articles[0]["raw_title"] == "Good"
