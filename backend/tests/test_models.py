"""
Pydantic 数据模型单元测试 (models/article.py, models/source.py)。

覆盖场景:
- LLMAnalysis: 字段约束验证、默认值、tags 截断、枚举匹配
- ArticleDocument: 完整文档构建、默认值、状态转换
- CategoryEnum / ArticleStatus / RejectionReason: 枚举值完整性检查
- Source: 信源模型字段验证、SourceType 枚举
- 边界值: 极端评分、超长标题、空标签
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from backend.models.article import (
    ArticleDocument,
    ArticleStatus,
    CategoryEnum,
    LLMAnalysis,
    RejectionReason,
)
from backend.models.source import Source, SourceType


# ──────────────────────────────────────────────────────────────
# CategoryEnum 测试
# ──────────────────────────────────────────────────────────────

class TestCategoryEnum:
    def test_all_categories_defined(self):
        """确认所有预期分类都已定义。"""
        expected = {"默认", "模型发布", "论文/研究", "评测/基准",
                    "行业动态/政策监管/其他", "DevTool/工程向", "非AI/通用工具"}
        actual = {e.value for e in CategoryEnum}
        assert actual == expected

    def test_category_is_string(self):
        """CategoryEnum 应可直接当字符串用。"""
        assert CategoryEnum.MODEL_RELEASE == "模型发布"
        assert isinstance(CategoryEnum.DEFAULT, str)


class TestArticleStatus:
    def test_all_statuses(self):
        """确认三种文章状态。"""
        assert {s.value for s in ArticleStatus} == {"pending", "selected", "rejected"}


class TestRejectionReason:
    def test_all_reasons(self):
        """确认所有拒绝原因码。"""
        expected = {"", "REJECTED_NON_AI", "REJECTED_LOW_RELEVANCE",
                    "REJECTED_MODEL_UNSELECTED", "REJECTED_LOW_IMPORTANCE"}
        assert {r.value for r in RejectionReason} == expected


# ──────────────────────────────────────────────────────────────
# LLMAnalysis 测试
# ──────────────────────────────────────────────────────────────

class TestLLMAnalysis:

    def test_valid_complete_analysis(self):
        """完整有效数据应通过验证。"""
        data = {
            "title": "GPT-5 发布",
            "summary": "OpenAI 发布新一代语言模型",
            "category": "模型发布",
            "ai_relevance": 95,
            "importance": 92,
            "model_selected": True,
            "tags": ["GPT-5", "OpenAI"],
        }
        analysis = LLMAnalysis.model_validate(data)
        assert analysis.title == "GPT-5 发布"
        assert analysis.ai_relevance == 95
        assert analysis.model_selected is True

    def test_default_category(self):
        """未指定分类时使用默认值。"""
        data = {
            "title": "测试标题",
            "summary": "摘要",
            "ai_relevance": 50,
            "importance": 50,
            "model_selected": False,
        }
        analysis = LLMAnalysis.model_validate(data)
        assert analysis.category == CategoryEnum.DEFAULT

    def test_default_tags(self):
        """未指定标签时默认为空列表。"""
        data = {
            "title": "测试",
            "summary": "摘要",
            "ai_relevance": 50,
            "importance": 50,
            "model_selected": False,
        }
        analysis = LLMAnalysis.model_validate(data)
        assert analysis.tags == []

    def test_tags_truncation(self):
        """超过 10 个标签应自动截断。"""
        data = {
            "title": "测试",
            "summary": "摘要",
            "category": "默认",
            "ai_relevance": 50,
            "importance": 50,
            "model_selected": False,
            "tags": [f"tag{i}" for i in range(20)],
        }
        analysis = LLMAnalysis.model_validate(data)
        assert len(analysis.tags) == 10

    def test_tags_non_list_becomes_empty(self):
        """非列表类型的 tags 应转为空列表。"""
        data = {
            "title": "测试",
            "summary": "摘要",
            "ai_relevance": 50,
            "importance": 50,
            "model_selected": False,
            "tags": "not_a_list",
        }
        analysis = LLMAnalysis.model_validate(data)
        assert analysis.tags == []

    def test_ai_relevance_boundary_min(self):
        """ai_relevance 下界为 0。"""
        data = {
            "title": "测试", "summary": "摘要",
            "ai_relevance": 0, "importance": 50,
            "model_selected": False,
        }
        analysis = LLMAnalysis.model_validate(data)
        assert analysis.ai_relevance == 0

    def test_ai_relevance_boundary_max(self):
        """ai_relevance 上界为 100。"""
        data = {
            "title": "测试", "summary": "摘要",
            "ai_relevance": 100, "importance": 50,
            "model_selected": False,
        }
        analysis = LLMAnalysis.model_validate(data)
        assert analysis.ai_relevance == 100

    def test_ai_relevance_below_min_fails(self):
        """ai_relevance < 0 应校验失败。"""
        with pytest.raises(ValidationError):
            LLMAnalysis.model_validate({
                "title": "测试", "summary": "摘要",
                "ai_relevance": -1, "importance": 50,
                "model_selected": False,
            })

    def test_ai_relevance_above_max_fails(self):
        """ai_relevance > 100 应校验失败。"""
        with pytest.raises(ValidationError):
            LLMAnalysis.model_validate({
                "title": "测试", "summary": "摘要",
                "ai_relevance": 101, "importance": 50,
                "model_selected": False,
            })

    def test_importance_boundary(self):
        """importance 边界值 0 和 100。"""
        for val in [0, 100]:
            data = {
                "title": "测试", "summary": "摘要",
                "ai_relevance": 50, "importance": val,
                "model_selected": False,
            }
            analysis = LLMAnalysis.model_validate(data)
            assert analysis.importance == val

    def test_importance_out_of_range_fails(self):
        """importance 超出范围应失败。"""
        with pytest.raises(ValidationError):
            LLMAnalysis.model_validate({
                "title": "测试", "summary": "摘要",
                "ai_relevance": 50, "importance": 101,
                "model_selected": False,
            })

    def test_missing_required_field_fails(self):
        """缺少必填字段应失败。"""
        with pytest.raises(ValidationError):
            LLMAnalysis.model_validate({"title": "测试"})

    def test_invalid_category_fails(self):
        """无效分类值应失败。"""
        with pytest.raises(ValidationError):
            LLMAnalysis.model_validate({
                "title": "测试", "summary": "摘要",
                "category": "不存在的分类",
                "ai_relevance": 50, "importance": 50,
                "model_selected": False,
            })

    def test_model_dump_serialization(self):
        """model_dump 应返回可序列化的字典。"""
        analysis = LLMAnalysis.model_validate({
            "title": "测试", "summary": "摘要",
            "ai_relevance": 80, "importance": 75,
            "model_selected": True, "tags": ["AI"],
        })
        d = analysis.model_dump()
        assert isinstance(d, dict)
        assert d["title"] == "测试"
        assert d["tags"] == ["AI"]


# ──────────────────────────────────────────────────────────────
# ArticleDocument 测试
# ──────────────────────────────────────────────────────────────

class TestArticleDocument:

    def test_minimal_valid_document(self):
        """最小有效文档只需 url 和 url_hash。"""
        doc = ArticleDocument(url="https://example.com", url_hash="abc123")
        assert doc.status == ArticleStatus.PENDING
        assert doc.starred is False
        assert doc.analysis is None

    def test_full_document(self):
        """完整字段文档构建。"""
        now = datetime.now(timezone.utc)
        doc = ArticleDocument(
            url="https://example.com/article",
            url_hash="hash123",
            source_id="src_1",
            source_name="TestSource",
            raw_html="<p>Hello</p>",
            clean_markdown="Hello",
            analysis=LLMAnalysis(
                title="测试", summary="摘要",
                ai_relevance=80, importance=70,
                model_selected=True,
            ),
            status=ArticleStatus.SELECTED,
            starred=True,
            fetched_at=now,
            analyzed_at=now,
        )
        assert doc.source_name == "TestSource"
        assert doc.analysis.title == "测试"
        assert doc.status == "selected"

    def test_default_status_is_pending(self):
        """默认状态应为 pending。"""
        doc = ArticleDocument(url="https://x.com", url_hash="h1")
        assert doc.status == "pending"

    def test_default_rejection_reason_is_empty(self):
        """默认拒绝原因为空字符串。"""
        doc = ArticleDocument(url="https://x.com", url_hash="h1")
        assert doc.rejection_reason == ""

    def test_use_enum_values(self):
        """Config.use_enum_values 确保枚举字段输出原始值。"""
        doc = ArticleDocument(
            url="https://x.com", url_hash="h1",
            status=ArticleStatus.REJECTED,
            rejection_reason=RejectionReason.NON_AI,
        )
        assert doc.status == "rejected"
        assert doc.rejection_reason == "REJECTED_NON_AI"


# ──────────────────────────────────────────────────────────────
# Source 模型测试
# ──────────────────────────────────────────────────────────────

class TestSource:

    def test_valid_source(self):
        """基本有效信源。"""
        s = Source(name="OpenAI Blog", url="https://openai.com/blog/rss.xml")
        assert s.source_type == "rss"
        assert s.enabled is True
        assert s.tags == []

    def test_source_type_enum(self):
        """信源类型枚举覆盖。"""
        for st in ["rss", "api", "web"]:
            s = Source(name="Test", url="https://test.com", source_type=st)
            assert s.source_type == st

    def test_invalid_source_type_fails(self):
        """无效信源类型应失败。"""
        with pytest.raises(ValidationError):
            Source(name="Test", url="https://test.com", source_type="ftp")

    def test_default_fetch_interval(self):
        """默认采集间隔 30 分钟。"""
        s = Source(name="Test", url="https://test.com")
        assert s.fetch_interval_minutes == 30

    def test_source_with_tags(self):
        """信源标签赋值。"""
        s = Source(name="Test", url="https://test.com", tags=["大佬blog", "官方"])
        assert "大佬blog" in s.tags

    def test_source_category(self):
        """信源分类字段。"""
        s = Source(name="Test", url="https://test.com", category="AI 官方博客")
        assert s.category == "AI 官方博客"

    def test_created_at_auto_set(self):
        """创建时间自动设置。"""
        s = Source(name="Test", url="https://test.com")
        assert isinstance(s.created_at, datetime)
