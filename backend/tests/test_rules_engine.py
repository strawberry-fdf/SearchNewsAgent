"""
规则引擎 (rules/engine.py) 单元测试。

覆盖场景:
- 四步过滤漏斗的每一步独立验证
- 白名单「大佬blog」豁免机制
- 各分类的重要性阈值边界测试
- 极端评分组合
- 全路径通过 / 全路径拒绝
"""

from __future__ import annotations

import pytest

from backend.rules.engine import (
    DEFAULT_THRESHOLD,
    IMPORTANCE_THRESHOLDS,
    evaluate_article,
)


# ──────────────────────────────────────────────────────────────
# 辅助：构建 analysis dict
# ──────────────────────────────────────────────────────────────

def _analysis(
    category: str = "模型发布",
    ai_relevance: int = 85,
    importance: int = 90,
    model_selected: bool = True,
) -> dict:
    return {
        "category": category,
        "ai_relevance": ai_relevance,
        "importance": importance,
        "model_selected": model_selected,
    }


# ──────────────────────────────────────────────────────────────
# Step 1: 非 AI 分类拦截
# ──────────────────────────────────────────────────────────────

class TestStep1NonAI:
    """Step 1: category == '非AI/通用工具' 直接拦截。"""

    def test_non_ai_rejected(self):
        status, reason = evaluate_article(_analysis(category="非AI/通用工具"))
        assert status == "rejected"
        assert reason == "REJECTED_NON_AI"

    def test_non_ai_high_scores_still_rejected(self):
        """即使分数很高，非AI 分类也必须被拦截。"""
        status, reason = evaluate_article(_analysis(
            category="非AI/通用工具", ai_relevance=100, importance=100, model_selected=True,
        ))
        assert status == "rejected"
        assert reason == "REJECTED_NON_AI"

    def test_ai_category_passes_step1(self):
        """其他分类应通过 Step 1。"""
        for cat in ["默认", "模型发布", "论文/研究", "评测/基准", "行业动态/政策监管/其他", "DevTool/工程向"]:
            status, reason = evaluate_article(_analysis(category=cat, importance=95))
            assert status != "rejected" or reason != "REJECTED_NON_AI", f"{cat} 不应被 Step1 拦截"


# ──────────────────────────────────────────────────────────────
# Step 2: AI 相关性硬拦截
# ──────────────────────────────────────────────────────────────

class TestStep2Relevance:
    """Step 2: ai_relevance < 60 硬拦截。"""

    def test_low_relevance_rejected(self):
        status, reason = evaluate_article(_analysis(ai_relevance=59))
        assert status == "rejected"
        assert reason == "REJECTED_LOW_RELEVANCE"

    def test_relevance_exactly_60_passes(self):
        """恰好 60 分应通过。"""
        status, reason = evaluate_article(_analysis(ai_relevance=60, importance=90))
        assert reason != "REJECTED_LOW_RELEVANCE"

    def test_relevance_zero_rejected(self):
        status, reason = evaluate_article(_analysis(ai_relevance=0))
        assert status == "rejected"
        assert reason == "REJECTED_LOW_RELEVANCE"

    def test_high_importance_low_relevance_still_rejected(self):
        """即使重要性 100，相关性不足仍然拦截。"""
        status, reason = evaluate_article(_analysis(ai_relevance=50, importance=100))
        assert status == "rejected"
        assert reason == "REJECTED_LOW_RELEVANCE"


# ──────────────────────────────────────────────────────────────
# Step 3: 模型精选 + 白名单豁免
# ──────────────────────────────────────────────────────────────

class TestStep3ModelSelected:
    """Step 3: model_selected == False 拦截，但大佬 blog 可豁免。"""

    def test_not_selected_rejected(self):
        status, reason = evaluate_article(_analysis(model_selected=False))
        assert status == "rejected"
        assert reason == "REJECTED_MODEL_UNSELECTED"

    def test_selected_passes(self):
        status, reason = evaluate_article(_analysis(model_selected=True, importance=90))
        assert reason != "REJECTED_MODEL_UNSELECTED"

    def test_vip_blog_exemption(self):
        """大佬blog 标签在非 DevTool 分类下应获豁免。"""
        status, reason = evaluate_article(
            _analysis(model_selected=False, category="模型发布", importance=90),
            source_tags=["大佬blog"],
        )
        assert reason != "REJECTED_MODEL_UNSELECTED"

    def test_vip_blog_no_exemption_for_devtool(self):
        """大佬blog 标签在 DevTool 分类下不豁免。"""
        status, reason = evaluate_article(
            _analysis(model_selected=False, category="DevTool/工程向", importance=95),
            source_tags=["大佬blog"],
        )
        assert status == "rejected"
        assert reason == "REJECTED_MODEL_UNSELECTED"

    def test_non_vip_tags_no_exemption(self):
        """非大佬blog 标签不能豁免。"""
        status, reason = evaluate_article(
            _analysis(model_selected=False, importance=90),
            source_tags=["官方", "论文"],
        )
        assert status == "rejected"
        assert reason == "REJECTED_MODEL_UNSELECTED"

    def test_empty_source_tags_no_exemption(self):
        """空标签列表不能豁免。"""
        status, reason = evaluate_article(
            _analysis(model_selected=False, importance=90),
            source_tags=[],
        )
        assert status == "rejected"
        assert reason == "REJECTED_MODEL_UNSELECTED"

    def test_none_source_tags_no_exemption(self):
        """source_tags=None 不能豁免。"""
        status, reason = evaluate_article(
            _analysis(model_selected=False, importance=90),
            source_tags=None,
        )
        assert status == "rejected"
        assert reason == "REJECTED_MODEL_UNSELECTED"


# ──────────────────────────────────────────────────────────────
# Step 4: 重要性动态门槛
# ──────────────────────────────────────────────────────────────

class TestStep4ImportanceThreshold:
    """Step 4: 按分类应用不同的重要性门槛。"""

    def test_thresholds_defined(self):
        """确认所有分类的阈值已定义。"""
        expected_categories = {"默认", "模型发布", "论文/研究", "评测/基准",
                               "行业动态/政策监管/其他", "DevTool/工程向"}
        assert set(IMPORTANCE_THRESHOLDS.keys()) == expected_categories

    @pytest.mark.parametrize("category,threshold", [
        ("默认", 75),
        ("模型发布", 75),
        ("论文/研究", 82),
        ("评测/基准", 84),
        ("行业动态/政策监管/其他", 88),
        ("DevTool/工程向", 86),
    ])
    def test_exact_threshold_passes(self, category: str, threshold: int):
        """恰好等于阈值的重要性分数应通过。"""
        status, reason = evaluate_article(_analysis(
            category=category, importance=threshold, model_selected=True,
        ))
        assert status == "selected", f"{category} 阈值 {threshold} 应该入选"
        assert reason == ""

    @pytest.mark.parametrize("category,threshold", [
        ("默认", 75),
        ("模型发布", 75),
        ("论文/研究", 82),
        ("评测/基准", 84),
        ("行业动态/政策监管/其他", 88),
        ("DevTool/工程向", 86),
    ])
    def test_below_threshold_rejected(self, category: str, threshold: int):
        """低于阈值 1 分应被拦截。"""
        status, reason = evaluate_article(_analysis(
            category=category, importance=threshold - 1, model_selected=True,
        ))
        assert status == "rejected"
        assert reason == "REJECTED_LOW_IMPORTANCE"

    def test_unknown_category_uses_default_threshold(self):
        """未知分类使用默认阈值 75。"""
        status, reason = evaluate_article(_analysis(
            category="未知分类", importance=75, model_selected=True,
        ))
        assert status == "selected"

    def test_unknown_category_below_default_rejected(self):
        status, reason = evaluate_article(_analysis(
            category="未知分类", importance=74, model_selected=True,
        ))
        assert status == "rejected"
        assert reason == "REJECTED_LOW_IMPORTANCE"


# ──────────────────────────────────────────────────────────────
# 全路径测试
# ──────────────────────────────────────────────────────────────

class TestFullPathScenarios:
    """端到端场景：完整通过和各步骤拒绝。"""

    def test_perfect_article_selected(self):
        """最优文章：全部通过四步，入选。"""
        status, reason = evaluate_article(_analysis(
            category="模型发布", ai_relevance=95, importance=95, model_selected=True,
        ))
        assert status == "selected"
        assert reason == ""

    def test_borderline_selected(self):
        """临界文章：所有阈值恰好通过。"""
        status, reason = evaluate_article(_analysis(
            category="模型发布", ai_relevance=60, importance=75, model_selected=True,
        ))
        assert status == "selected"

    def test_cascade_rejection_stops_at_first_failure(self):
        """级联拒绝：同时不满足多个条件，只返回第一个拒绝原因。"""
        # 非 AI 分类 + 低相关性 + 未精选 + 低重要性
        status, reason = evaluate_article(_analysis(
            category="非AI/通用工具", ai_relevance=10, importance=10, model_selected=False,
        ))
        # 应在 Step 1 就被拦截
        assert reason == "REJECTED_NON_AI"

    def test_vip_blog_bypass_step3_but_fail_step4(self):
        """大佬blog 豁免 Step 3，但在 Step 4 被拦截。"""
        status, reason = evaluate_article(
            _analysis(
                category="论文/研究", ai_relevance=80,
                importance=70, model_selected=False,  # 81 是阈值，70 < 82
            ),
            source_tags=["大佬blog"],
        )
        assert status == "rejected"
        assert reason == "REJECTED_LOW_IMPORTANCE"

    def test_vip_blog_full_pass(self):
        """大佬blog 豁免 Step 3 且 Step 4 也通过。"""
        status, reason = evaluate_article(
            _analysis(
                category="模型发布", ai_relevance=80,
                importance=80, model_selected=False,
            ),
            source_tags=["大佬blog"],
        )
        assert status == "selected"
        assert reason == ""

    @pytest.mark.parametrize("missing_key", ["category", "ai_relevance", "importance", "model_selected"])
    def test_missing_key_uses_defaults(self, missing_key: str):
        """缺少键时使用安全默认值（dict.get 语义）。"""
        data = _analysis()
        del data[missing_key]
        # 不应抛出异常
        status, reason = evaluate_article(data)
        assert status in ("selected", "rejected")
