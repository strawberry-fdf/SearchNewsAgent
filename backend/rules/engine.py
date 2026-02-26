"""
规则引擎模块 —— 实现 PRD 中的四步硬核精选决策流水线。

四步过滤漏斗:
  Step 1: 非 AI 分类直接拦截 (category == "非AI/通用工具")
  Step 2: AI 相关性硬拦截 (ai_relevance < 60)
  Step 3: 模型精选结果拦截 + 白名单豁免 ("大佬blog" 标签)
  Step 4: 重要性动态门槛拦截 (按分类设置不同阈值)

设计原则: 宁缺毋滥，确保“精选”内容的高质量。
"""

from __future__ import annotations

import logging
from typing import Dict, List, Tuple

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────
# 每个分类的重要性分数门槛（Step 4）
# 数值越高 → 该分类入选越难，保证精选质量
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
    """对单篇文章的 LLM 分析结果执行四步过滤。

    Parameters
    ----------
    analysis : dict
        必须包含键: category, ai_relevance, model_selected, importance。
    source_tags : list[str]
        信源配置的自定义标签（如 ["大佬blog"]）。

    Returns
    -------
    (status, reason) : tuple[str, str]
        status 为 "selected" 或 "rejected"；
        reason 为空字符串或 REJECTED_* 拒绝码。
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
