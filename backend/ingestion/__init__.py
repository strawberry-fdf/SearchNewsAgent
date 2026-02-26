"""
数据采集包 (Data Ingestion) —— 负责从多渠道获取原始文章数据。

子模块:
- rss_fetcher: RSS/Atom 源解析与抓取
- web_scraper: 网页爬虫（支持静态页面和 Playwright 动态渲染）
- dedup: URL 去重工具（SHA-256 哈希）
"""
