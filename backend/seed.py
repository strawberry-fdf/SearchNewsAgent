"""
Seed script – populates the sources collection with a curated list of
AI/ML news RSS feeds and web sources for initial setup.

Usage:
    python -m backend.seed
"""

import asyncio
from backend.storage.db import close_db, upsert_source

SEED_SOURCES = [
    {
        "name": "OpenAI Blog",
        "url": "https://openai.com/blog/rss.xml",
        "source_type": "rss",
        "tags": ["大佬blog", "官方"],
        "enabled": True,
        "fetch_interval_minutes": 30,
    },
    {
        "name": "Google AI Blog",
        "url": "https://blog.google/technology/ai/rss/",
        "source_type": "rss",
        "tags": ["大佬blog", "官方"],
        "enabled": True,
        "fetch_interval_minutes": 30,
    },
    {
        "name": "Hugging Face Blog",
        "url": "https://huggingface.co/blog/feed.xml",
        "source_type": "rss",
        "tags": ["开源社区"],
        "enabled": True,
        "fetch_interval_minutes": 60,
    },
    {
        "name": "The Batch (Andrew Ng)",
        "url": "https://www.deeplearning.ai/the-batch/feed/",
        "source_type": "rss",
        "tags": ["大佬blog"],
        "enabled": True,
        "fetch_interval_minutes": 120,
    },
    {
        "name": "MIT Technology Review - AI",
        "url": "https://www.technologyreview.com/topic/artificial-intelligence/feed",
        "source_type": "rss",
        "tags": ["媒体"],
        "enabled": True,
        "fetch_interval_minutes": 60,
    },
    {
        "name": "Arxiv CS.AI (recent)",
        "url": "https://rss.arxiv.org/rss/cs.AI",
        "source_type": "rss",
        "tags": ["论文"],
        "enabled": True,
        "fetch_interval_minutes": 120,
    },
    {
        "name": "Hacker News - AI",
        "url": "https://hnrss.org/newest?q=AI+OR+LLM+OR+GPT+OR+Claude&points=50",
        "source_type": "rss",
        "tags": ["社区"],
        "enabled": True,
        "fetch_interval_minutes": 30,
    },
    {
        "name": "Anthropic Newsroom",
        "url": "https://www.anthropic.com/news",
        "source_type": "web",
        "tags": ["大佬blog", "官方"],
        "enabled": True,
        "fetch_interval_minutes": 60,
    },
]


async def main():
    print("🌱 Seeding sources...")
    for source in SEED_SOURCES:
        result = await upsert_source(source)
        print(f"  ✅ {source['name']}: {result}")
    await close_db()
    print("🌱 Done! Seeded %d sources." % len(SEED_SOURCES))


if __name__ == "__main__":
    asyncio.run(main())
