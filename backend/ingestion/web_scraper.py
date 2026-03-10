"""
网页爬虫模块 —— 基于 Scrapling 的高性能网页内容抓取。

功能:
- 静态页面: AsyncFetcher + FetcherSession（TLS 指纹伪装 + 连接池复用 + 内置重试）
- 动态/反爬页面: AsyncStealthySession（Playwright + 反检测，可绕过 Cloudflare 等）
- 并发限流: asyncio.Semaphore 控制并发数，避免触发反爬
- 健壮异常处理: 网络超时 / 封禁 / 反爬策略的多级重试与兜底
- HTML 降噪: lxml 清洗噪音标签 + markdownify 转 Markdown
"""

from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Union
from urllib.parse import urljoin, urlparse

from markdownify import markdownify as md
from scrapling.fetchers import AsyncFetcher, FetcherSession
from scrapling.parser import Selector

try:
    from lxml import html as lxml_html
except ImportError:  # pragma: no cover - 由环境依赖决定是否触发
    lxml_html = None

from backend.ingestion.dedup import url_hash

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────
# 常量
# ──────────────────────────────────────────────────────────────
_DEFAULT_TIMEOUT = 30
_MAX_CONCURRENT = 5
_MAX_ARTICLES = 20
_MAX_RETRIES = 3
_RETRY_DELAY = 1
_MAX_HTML_SIZE = 50_000

# 降噪：需要移除的 HTML 标签和 CSS 类名
_NOISE_TAGS = ("nav", "footer", "header", "aside", "script", "style", "noscript")
_NOISE_CLASSES = (
    "sidebar", "advertisement", "ad-container", "cookie-banner", "popup",
)
_TAG_BLOCK_PATTERN = re.compile(
    r"<(?P<tag>nav|footer|header|aside|script|style|noscript)\b[^>]*>.*?</(?P=tag)>",
    re.IGNORECASE | re.DOTALL,
)
_NOISE_CLASS_PATTERN = re.compile(
    r"<(?P<tag>[a-z0-9]+)\b[^>]*class=[\"'][^\"']*"
    r"(?:sidebar|advertisement|ad-container|cookie-banner|popup)[^\"']*[\"'][^>]*>"
    r".*?</(?P=tag)>",
    re.IGNORECASE | re.DOTALL,
)


# ──────────────────────────────────────────────────────────────
# 公开 API
# ──────────────────────────────────────────────────────────────

async def scrape_web_page(
    page_url: str,
    source_id: Optional[str] = None,
    source_name: Optional[str] = None,
    link_selector: Optional[str] = None,
    use_stealth: bool = False,
) -> List[Dict[str, Any]]:
    """
    抓取网页索引页中的文章链接，并发获取每篇文章内容。

    Parameters
    ----------
    page_url : str
        索引页 / Newsroom 页面 URL。
    source_id : str, optional
        信源标识符。
    source_name : str, optional
        信源名称，缺省取 URL 的 netloc。
    link_selector : str, optional
        CSS 选择器，限定链接提取范围；缺省提取所有 <a href>。
    use_stealth : bool
        若为 True，使用 StealthyFetcher 渲染 JS 并绕过反爬检测。
        需要安装 ``scrapling[fetchers]`` 并执行 ``scrapling install``。

    Returns
    -------
    list[dict]
        适合入库 / LLM 处理的文章数据列表。
    """
    articles: List[Dict[str, Any]] = []

    # ── 1. 获取并解析索引页 ──
    try:
        page = await _fetch_page(page_url, use_stealth)
    except Exception as exc:
        logger.error("Failed to scrape index page %s: %s", page_url, exc)
        return articles

    # ── 2. 提取文章链接 ──
    links = _extract_links(page, page_url, link_selector)
    logger.info("Found %d links on %s", len(links), page_url)

    if not links:
        return articles

    # ── 3. 并发抓取文章（共享 Session + 信号量限流） ──
    sem = asyncio.Semaphore(_MAX_CONCURRENT)
    effective_name = source_name or urlparse(page_url).netloc

    async with FetcherSession(
        impersonate="chrome",
        stealthy_headers=True,
        follow_redirects=True,
        timeout=_DEFAULT_TIMEOUT,
        retries=_MAX_RETRIES,
        retry_delay=_RETRY_DELAY,
    ) as session:

        async def _fetch_article(link: str) -> Optional[Dict[str, Any]]:
            """在信号量保护下抓取单篇文章。"""
            async with sem:
                try:
                    resp = await session.get(link)
                except Exception as exc:
                    logger.warning("Network error fetching %s: %s", link, exc)
                    return None

                # ── 状态码分级处理 ──
                if resp.status == 429:
                    logger.warning("Rate-limited (429) on %s, skipping", link)
                    return None
                if resp.status in (403, 503):
                    logger.warning(
                        "Blocked (HTTP %d) on %s, skipping", resp.status, link,
                    )
                    return None
                if resp.status != 200:
                    logger.warning(
                        "Non-200 status %d for %s, skipping", resp.status, link,
                    )
                    return None

                # ── 解码 HTML ──
                try:
                    encoding = resp.encoding or "utf-8"
                    article_html = resp.body.decode(encoding, errors="replace")
                except Exception as exc:
                    logger.warning("Failed to decode response for %s: %s", link, exc)
                    return None

                clean_markdown = _html_to_markdown(article_html)
                raw_title = _extract_title(article_html)

                return {
                    "url": link,
                    "url_hash": url_hash(link),
                    "source_id": source_id,
                    "source_name": effective_name,
                    "raw_html": article_html[:_MAX_HTML_SIZE],
                    "clean_markdown": clean_markdown,
                    "raw_title": raw_title,
                    "status": "pending",
                    "starred": False,
                    "fetched_at": datetime.now(timezone.utc),
                    "published_at": None,
                    "analysis": None,
                    "rejection_reason": "",
                }

        tasks = [_fetch_article(link) for link in links[:_MAX_ARTICLES]]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    for r in results:
        if isinstance(r, dict):
            articles.append(r)
        elif isinstance(r, Exception):
            logger.warning("Unexpected error during article fetch: %s", r)

    return articles


# ──────────────────────────────────────────────────────────────
# 页面获取
# ──────────────────────────────────────────────────────────────

async def _fetch_page(url: str, use_stealth: bool = False) -> Any:
    """
    获取并解析网页，返回 Scrapling Response（即 Selector）。

    - 默认模式: AsyncFetcher — 纯 HTTP，TLS 指纹伪装，内置 3 次重试。
    - Stealth 模式: AsyncStealthySession — Playwright + 反检测，
      可绕过 Cloudflare Turnstile 等防护。
    """
    if use_stealth:
        try:
            from scrapling.fetchers import AsyncStealthySession
        except ImportError:
            logger.error(
                "Scrapling fetchers not installed. "
                "Run: pip install 'scrapling[fetchers]' && scrapling install",
            )
            raise

        async with AsyncStealthySession(headless=True) as session:
            return await session.fetch(url, network_idle=True)

    return await AsyncFetcher.get(
        url,
        stealthy_headers=True,
        follow_redirects=True,
        timeout=_DEFAULT_TIMEOUT,
        retries=_MAX_RETRIES,
        retry_delay=_RETRY_DELAY,
    )


# ──────────────────────────────────────────────────────────────
# 链接提取
# ──────────────────────────────────────────────────────────────

def _extract_links(
    page_or_html: Union[str, Any],
    base_url: str,
    selector: Optional[str] = None,
) -> List[str]:
    """
    从已解析的页面或原始 HTML 中提取并去重文章链接。

    Parameters
    ----------
    page_or_html : str | Selector | Response
        Scrapling Selector/Response 对象，或原始 HTML 字符串。
    base_url : str
        用于解析相对 URL 的基准地址。
    selector : str, optional
        CSS 选择器，限定链接提取范围。
    """
    page = _ensure_selector(page_or_html)
    if page is None:
        return []

    # 提取 href 列表
    if selector:
        # 先尝试将 selector 视为指向 <a> 元素的选择器
        hrefs = page.css(f"{selector}::attr(href)").getall()
        if not hrefs:
            # selector 可能指向容器，查找其内部的 <a>
            hrefs = page.css(f"{selector} a::attr(href)").getall()
    else:
        hrefs = page.css("a::attr(href)").getall()

    # 去重 + 解析相对 URL
    seen: set[str] = set()
    links: List[str] = []
    for href in hrefs:
        href = href.strip()
        if not href or href.startswith("#") or href.startswith("javascript:"):
            continue
        full_url = urljoin(base_url, href)
        if full_url not in seen:
            seen.add(full_url)
            links.append(full_url)

    return links


# ──────────────────────────────────────────────────────────────
# HTML → Markdown（含降噪）
# ──────────────────────────────────────────────────────────────

def _html_to_markdown(html: str) -> str:
    """
    将原始 HTML 转为干净的 Markdown。

    步骤:
    1. lxml 解析 HTML 文档
    2. 移除噪音标签（nav / footer / script 等）
    3. 移除含广告/侧边栏类名的元素
    4. 定位主体内容区域（main > article > div.content > body）
    5. markdownify 转换
    """
    if not html or not html.strip():
        return ""

    if lxml_html is None:
        logger.warning("lxml is not installed; using simplified HTML cleanup fallback")
        return _fallback_html_to_markdown(html)

    try:
        doc = lxml_html.document_fromstring(html)
    except Exception:
        # 解析失败时直接交给 markdownify 做最大努力转换
        return md(html).strip()

    # ── 移除噪音标签 ──
    for tag_name in _NOISE_TAGS:
        for el in doc.cssselect(tag_name):
            el.drop_tree()

    # ── 移除含噪音类名的元素 ──
    to_remove = []
    for el in doc.iter():
        cls = (el.get("class") or "").lower()
        if any(nc in cls for nc in _NOISE_CLASSES):
            to_remove.append(el)
    for el in to_remove:
        try:
            el.drop_tree()
        except Exception:
            pass  # 父元素可能已被先行移除

    # ── 定位主体内容 ──
    main_candidates = (
        doc.cssselect("main")
        or doc.cssselect("article")
        or doc.cssselect("div.content")
    )
    target = main_candidates[0] if main_candidates else doc.body
    if target is None:
        target = doc

    target_html = lxml_html.tostring(target, encoding="unicode", method="html")
    return md(target_html).strip()


# ──────────────────────────────────────────────────────────────
# 标题提取
# ──────────────────────────────────────────────────────────────

def _extract_title(page_or_html: Union[str, Any]) -> str:
    """从页面中提取标题：优先 <h1>，回退 <title>。"""
    page = _ensure_selector(page_or_html)
    if page is None:
        return _extract_title_fallback(page_or_html if isinstance(page_or_html, str) else "")

    h1_text = page.css("h1::text").get()
    if h1_text and h1_text.strip():
        return h1_text.strip()

    title_text = page.css("title::text").get()
    if title_text and title_text.strip():
        return title_text.strip()

    return ""


def _fallback_html_to_markdown(html: str) -> str:
    """在缺少 lxml 时执行轻量级降噪，避免模块导入直接中断。"""
    stripped_html = _TAG_BLOCK_PATTERN.sub("", html)
    stripped_html = _NOISE_CLASS_PATTERN.sub("", stripped_html)
    return md(stripped_html).strip()


def _extract_title_fallback(html: str) -> str:
    """缺少 Selector 或 HTML 解析失败时的标题兜底。"""
    if not html:
        return ""

    h1_match = re.search(r"<h1\b[^>]*>(.*?)</h1>", html, re.IGNORECASE | re.DOTALL)
    if h1_match:
        h1_text = re.sub(r"<[^>]+>", " ", h1_match.group(1)).strip()
        if h1_text:
            return " ".join(h1_text.split())

    title_match = re.search(r"<title\b[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
    if title_match:
        title_text = re.sub(r"<[^>]+>", " ", title_match.group(1)).strip()
        if title_text:
            return " ".join(title_text.split())

    return ""


# ──────────────────────────────────────────────────────────────
# 内部工具
# ──────────────────────────────────────────────────────────────

def _ensure_selector(page_or_html: Union[str, Any]) -> Any:
    """
    统一输入：若传入原始 HTML 字符串，则解析为 Scrapling Selector；
    若已是 Selector/Response，直接返回。解析失败返回 None。
    """
    if isinstance(page_or_html, str):
        if not page_or_html.strip():
            return None
        try:
            return Selector(page_or_html)
        except Exception:
            logger.warning("Failed to parse HTML into Selector")
            return None
    return page_or_html
