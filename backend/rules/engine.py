"""
Rules Engine – implements the 4-step hardcore filter pipeline
from the PRD (核心精选决策流水线).
"""

from __future__ import annotations

import logging
from typing import Dict, List, Tuple

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────
# Importance thresholds per category (Step 4)
# ──────────────────────────────────────────────────────────────

IMPORTANCE_THRESHOLDS: Dict[str, int] = {
    "默认": 75,
    "模型发布": 75,
    "论文/研究": 82,
    "评测/基准": 84,
    "行业动态/政策监管/其他": 88,
    "DevTool/工程向": 86,
}

DEFAULT_THRESHOLD = 75


def evaluate_article(analysis: dict, source_tags: List[str] | None = None) -> Tuple[str, str]:
    """
    Run the 4-step filter pipeline on an LLM analysis result.

    Parameters
    ----------
    analysis : dict
        Must contain keys: category, ai_relevance, model_selected, importance.
    source_tags : list[str]
        Custom tags from the source definition (e.g. ["大佬blog"]).

    Returns
    -------
    (status, reason) : tuple[str, str]
        status is "selected" or "rejected".
        reason is "" for selected, or one of the REJECTED_* codes.
    """
    if source_tags is None:
        source_tags = []

    category = analysis.get("category", "默认")
    ai_relevance = analysis.get("ai_relevance", 0)
    importance = analysis.get("importance", 0)
    model_selected = analysis.get("model_selected", False)

    # Step 1: 非 AI 分类直接拦截
    if category == "非AI/通用工具":
        logger.debug("REJECTED_NON_AI: category=%s", category)
        return "rejected", "REJECTED_NON_AI"

    # Step 2: AI 相关性硬拦截 (低于60分)
    if ai_relevance < 60:
        logger.debug("REJECTED_LOW_RELEVANCE: ai_relevance=%d", ai_relevance)
        return "rejected", "REJECTED_LOW_RELEVANCE"

    # Step 3: 模型精选结果硬拦截 + 白名单豁免
    if not model_selected:
        is_vip_blog = "大佬blog" in source_tags
        if not (is_vip_blog and category != "DevTool/工程向"):
            logger.debug("REJECTED_MODEL_UNSELECTED: model_selected=%s, vip=%s", model_selected, is_vip_blog)
            return "rejected", "REJECTED_MODEL_UNSELECTED"

    # Step 4: 重要性动态门槛拦截
    required_score = IMPORTANCE_THRESHOLDS.get(category, DEFAULT_THRESHOLD)
    if importance < required_score:
        logger.debug(
            "REJECTED_LOW_IMPORTANCE: importance=%d < threshold=%d (category=%s)",
            importance, required_score, category,
        )
        return "rejected", "REJECTED_LOW_IMPORTANCE"

    logger.info("SELECTED: category=%s, importance=%d, ai_relevance=%d", category, importance, ai_relevance)
    return "selected", ""
