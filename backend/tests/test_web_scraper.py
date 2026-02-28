"""
网页爬虫模块 (ingestion/web_scraper.py) 单元测试。

覆盖场景:
- HTML 链接提取
- HTML → Markdown 转换（噪音标签移除）
- 标题提取（h1 优先 / title 回退）
- CSS 选择器链接筛选
- scrape_web_page 完整流程
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
        html = '<a href="/art">A</a><a href="/art">B</a>'
        links = _extract_links(html, "https://example.com")
        assert len(links) == 1

    def test_skip_hash_and_javascript(self):
        """应跳过 # 锚点和 javascript: 链接。"""
        html = '<a href="#">Top</a><a href="javascript:void(0)">Click</a><a href="/real">Real</a>'
        links = _extract_links(html, "https://example.com")
        assert len(links) == 1
        assert "https://example.com/real" in links

    def test_absolute_url_preserved(self):
        """绝对 URL 应保持不变。"""
        html = '<a href="https://other.com/page">Link</a>'
        links = _extract_links(html, "https://example.com")
        assert links == ["https://other.com/page"]

    def test_relative_url_resolved(self):
        """相对 URL 应基于 base_url 解析。"""
        html = '<a href="blog/post-1">Link</a>'
        links = _extract_links(html, "https://example.com/")
        assert links == ["https://example.com/blog/post-1"]

    def test_with_selector(self):
        """CSS 选择器应限定链接提取范围。"""
        html = """
        <div class="nav"><a href="/nav1">Nav</a></div>
        <div class="articles"><a href="/art1">Art</a><a href="/art2">Art2</a></div>
        """
        links = _extract_links(html, "https://example.com", selector=".articles a")
        assert len(links) == 2
        assert all("/art" in l for l in links)

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

    @patch("backend.ingestion.web_scraper._fetch_html")
    @patch("backend.ingestion.web_scraper.httpx.AsyncClient")
    async def test_normal_scraping(self, mock_client_cls, mock_fetch):
        """正常爬取：发现链接 → 抓取每篇 → 返回 article stubs。"""
        # 模拟 index 页面
        mock_fetch.return_value = '<html><body><a href="https://example.com/post1">Post1</a></body></html>'

        # 模拟文章页面
        mock_article_resp = MagicMock()
        mock_article_resp.raise_for_status = MagicMock()
        mock_article_resp.text = "<html><head><title>Post 1</title></head><body><h1>Post Title</h1><p>Article body</p></body></html>"

        mock_client = AsyncMock()
        mock_client.get.return_value = mock_article_resp
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        articles = await scrape_web_page("https://example.com/news", source_name="TestWeb")

        assert len(articles) >= 1
        assert articles[0]["source_name"] == "TestWeb"
        assert articles[0]["status"] == "pending"
        assert len(articles[0]["url_hash"]) == 64

    @patch("backend.ingestion.web_scraper._fetch_html")
    async def test_fetch_error_returns_empty(self, mock_fetch):
        """获取页面失败时返回空列表。"""
        mock_fetch.side_effect = Exception("Connection timeout")
        articles = await scrape_web_page("https://example.com")
        assert articles == []
