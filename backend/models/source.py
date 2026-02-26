"""
信源 (Source) 数据模型 —— 表示系统监控的单个信息源。

支持类型:
- RSS: 常规 RSS/Atom Feed
- API: 第三方 API 接口（如 GitHub Trending）
- Web: 网页爬取目标（如 Anthropic Newsroom）
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class SourceType(str, Enum):
    RSS = "rss"
    API = "api"
    WEB = "web"  # scraping target


class Source(BaseModel):
    """A single information source tracked by the system."""

    name: str = Field(..., description="Human-readable name, e.g. 'OpenAI Blog'")
    url: str = Field(..., description="RSS feed URL / API endpoint / web page URL")
    source_type: SourceType = SourceType.RSS
    tags: List[str] = Field(default_factory=list, description="Custom tags, e.g. ['大佬blog']")
    enabled: bool = True
    fetch_interval_minutes: int = Field(default=30, description="Override global interval")
    category: str = Field(default="", description="User-defined category for grouping sources")

    # ---- metadata ----
    last_fetched_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Config:
        use_enum_values = True
