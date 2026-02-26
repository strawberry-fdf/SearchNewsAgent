"""文章数据模型 (Pydantic) —— 贯穿整个系统的核心数据结构。

用途:
- LLMAnalysis: LLM 结构化输出的校验 Schema
- ArticleDocument: MongoDB/SQLite 文档映射
- 枚举类: 分类、状态、拒绝原因等约束定义
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


# ──────────────────────────────────────────────────────────────
# Enums
# ──────────────────────────────────────────────────────────────

class CategoryEnum(str, Enum):
    DEFAULT = "默认"
    MODEL_RELEASE = "模型发布"
    PAPER_RESEARCH = "论文/研究"
    BENCHMARK = "评测/基准"
    INDUSTRY = "行业动态/政策监管/其他"
    DEVTOOL = "DevTool/工程向"
    NON_AI = "非AI/通用工具"


class ArticleStatus(str, Enum):
    PENDING = "pending"
    SELECTED = "selected"
    REJECTED = "rejected"


class RejectionReason(str, Enum):
    NONE = ""
    NON_AI = "REJECTED_NON_AI"
    LOW_RELEVANCE = "REJECTED_LOW_RELEVANCE"
    MODEL_UNSELECTED = "REJECTED_MODEL_UNSELECTED"
    LOW_IMPORTANCE = "REJECTED_LOW_IMPORTANCE"


# ──────────────────────────────────────────────────────────────
# LLM structured output schema
# ──────────────────────────────────────────────────────────────

class LLMAnalysis(BaseModel):
    """Schema returned by the LLM extractor — strict Pydantic validation."""

    title: str = Field(..., max_length=40, description="重写后的精炼标题(<=20字)")
    summary: str = Field(..., max_length=200, description="一句话核心摘要")
    category: CategoryEnum = Field(default=CategoryEnum.DEFAULT)
    ai_relevance: int = Field(..., ge=0, le=100, description="AI 相关性评分 0-100")
    importance: int = Field(..., ge=0, le=100, description="重要性评分 0-100")
    model_selected: bool = Field(..., description="模型是否推荐精选")
    tags: List[str] = Field(default_factory=list, max_length=10)

    @field_validator("tags", mode="before")
    @classmethod
    def truncate_tags(cls, v: list) -> list:
        return v[:10] if isinstance(v, list) else []


# ──────────────────────────────────────────────────────────────
# Full article document (maps to MongoDB)
# ──────────────────────────────────────────────────────────────

class ArticleDocument(BaseModel):
    """Represents a single article record stored in MongoDB."""

    url: str
    url_hash: str = Field(..., description="SHA-256 of url, used as dedup key")
    source_id: Optional[str] = None  # reference to source document _id
    source_name: Optional[str] = None  # human-readable source name

    # ---- raw content ----
    raw_html: Optional[str] = None
    clean_markdown: Optional[str] = None

    # ---- LLM analysis ----
    analysis: Optional[LLMAnalysis] = None

    # ---- rule engine result ----
    status: ArticleStatus = ArticleStatus.PENDING
    rejection_reason: RejectionReason = RejectionReason.NONE

    # ---- user interaction ----
    starred: bool = False

    # ---- timestamps ----
    fetched_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    analyzed_at: Optional[datetime] = None
    published_at: Optional[datetime] = None

    class Config:
        use_enum_values = True
