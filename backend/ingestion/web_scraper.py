"""
网页爬虫模块 —— 针对没有 RSS 的网站进行文章抓取。

功能:
- 静态页面: httpx + BeautifulSoup 提取链接
- 动态页面: Playwright 渲染后再提取（可选安装）
- HTML 降噪: 移除 nav/footer/广告，提取主体内容转 Markdown
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin, urlparse

import httpx
from markdownify import markdownify as md

from backend.ingestion.dedup import url_hash

logger = logging.getLogger(__name__)

_HTTP_TIMEOUT = 30


async def scrape_web_page(
    page_url: str,
    source_id: Optional[str] = None,
    source_name: Optional[str] = None,
    link_selector: Optional[str] = None,
    use_playwright: bool = False,
) -> List[Dict[str, Any]]:
    """
    Scrape a web page for article links and content.

    For simple index pages, this fetches HTML and extracts <a> links.
    Each discovered link is returned as an article stub.

    Parameters
    ----------
    page_url : str
        The index / newsroom page to scrape.
    link_selector : str, optional
        CSS selector to narrow down which links to follow.
        Falls back to extracting all <a href> from the page.
    use_playwright : bool
        If True, use Playwright for JS-rendered pages. Requires
        `playwright` to be installed.
    """
    articles: List[Dict[str, Any]] = []

    try:
        html = await _fetch_html(page_url, use_playwright)
    except Exception as exc:
        logger.error("Failed to scrape %s: %s", page_url, exc)
        return articles

    # ---- Extract links from the page ----
    links = _extract_links(html, page_url, link_selector)
    logger.info("Found %d links on %s", len(links), page_url)

    # For each link, try to fetch full content
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT, follow_redirects=True) as client:
        for link in links[:20]:  # cap to avoid runaway scraping
            try:
                resp = await client.get(link, headers={"User-Agent": "AgentNews/1.0"})
                resp.raise_for_status()
                article_html = resp.text
                clean_markdown = _html_to_markdown(article_html)
                raw_title = _extract_title(article_html)

                articles.append({
                    "url": link,
                    "url_hash": url_hash(link),
                    "source_id": source_id,
                    "source_name": source_name or urlparse(page_url).netloc,
                    "raw_html": article_html[:50000],  # cap storage
                    "clean_markdown": clean_markdown,
                    "raw_title": raw_title,
                    "status": "pending",
                    "starred": False,
                    "fetched_at": datetime.now(timezone.utc),
                    "published_at": None,
                    "analysis": None,
                    "rejection_reason": "",
                })
            except Exception as exc:
                logger.warning("Failed to fetch article %s: %s", link, exc)

    return articles


# ──────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────

async def _fetch_html(url: str, use_playwright: bool = False) -> str:
    """Fetch raw HTML, optionally via Playwright for dynamic pages."""
    if use_playwright:
        return await _fetch_with_playwright(url)

    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT, follow_redirects=True) as client:
        resp = await client.get(url, headers={"User-Agent": "AgentNews/1.0"})
        resp.raise_for_status()
        return resp.text


async def _fetch_with_playwright(url: str) -> str:
    """Use Playwright to render JS-heavy pages."""
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        logger.error("Playwright not installed. Run: pip install playwright && playwright install")
        raise

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto(url, wait_until="networkidle", timeout=20000)
        html = await page.content()
        await browser.close()
        return html


def _extract_links(html: str, base_url: str, selector: Optional[str] = None) -> List[str]:
    """Extract article links from an HTML page."""
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        logger.error("beautifulsoup4 not installed.")
        return []

    soup = BeautifulSoup(html, "html.parser")

    if selector:
        elements = soup.select(selector)
    else:
        elements = soup.find_all("a", href=True)

    seen = set()
    links: List[str] = []
    for el in elements:
        href = el.get("href", "").strip()
        if not href or href.startswith("#") or href.startswith("javascript:"):
            continue
        full_url = urljoin(base_url, href)
        if full_url not in seen:
            seen.add(full_url)
            links.append(full_url)

    return links


def _html_to_markdown(html: str) -> str:
    """Convert HTML to clean Markdown, stripping nav/footer/ads."""
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        return md(html).strip()

    soup = BeautifulSoup(html, "html.parser")

    # Remove noise elements
    for tag_name in ("nav", "footer", "header", "aside", "script", "style", "noscript"):
        for tag in soup.find_all(tag_name):
            tag.decompose()

    # Remove common ad / sidebar classes
    for cls in ("sidebar", "advertisement", "ad-container", "cookie-banner", "popup"):
        for el in soup.find_all(class_=lambda c: c and cls in c.lower() if c else False):
            el.decompose()

    # Try to find main content area
    main = soup.find("main") or soup.find("article") or soup.find("div", class_="content")
    target_html = str(main) if main else str(soup.body or soup)

    return md(target_html).strip()


def _extract_title(html: str) -> str:
    """从 HTML 中提取页面标题。"""
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        return ""

    soup = BeautifulSoup(html, "html.parser")
    # 优先取 <h1>，其次 <title>
    h1 = soup.find("h1")
    if h1 and h1.get_text(strip=True):
        return h1.get_text(strip=True)
    title_tag = soup.find("title")
    if title_tag and title_tag.get_text(strip=True):
        return title_tag.get_text(strip=True)
    return ""
