"""
LLM 分析引擎 —— 调用大语言模型对文章进行结构化深度分析。

流程:
1. 内容截断：按 Token 限制截断过长文本，控制成本
2. 调用 LLM：支持 OpenAI / Anthropic 双 Provider 切换
3. JSON 解析：带容错处理（剥离 code fence、Pydantic 校验）
4. 返回 LLMAnalysis 结构化对象

支持用户自定义筛选提示 (filter_prompt)，追加到 System Prompt 中。
"""

from __future__ import annotations

import json
import logging
from typing import Optional

from backend.config import settings
from backend.llm.prompts import SYSTEM_PROMPT, USER_PROMPT_TEMPLATE
from backend.models.article import LLMAnalysis

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────
# Token truncation
# ──────────────────────────────────────────────────────────────

def _truncate_content(text: str, max_tokens: int) -> str:
    """
    Rough character-level truncation (1 token ≈ 2-3 Chinese chars or ~4 English chars).
    Conservative: keep ~max_tokens * 3 characters.
    """
    max_chars = max_tokens * 3
    if len(text) > max_chars:
        logger.info("Truncating content from %d to %d chars", len(text), max_chars)
        return text[:max_chars] + "\n\n[...内容已截断...]"
    return text


# ──────────────────────────────────────────────────────────────
# Provider implementations
# ──────────────────────────────────────────────────────────────

async def _call_openai(content: str, system_prompt: str) -> str:
    """Call OpenAI API and return raw response text."""
    from openai import AsyncOpenAI

    client = AsyncOpenAI(
        api_key=settings.OPENAI_API_KEY,
        base_url=settings.OPENAI_BASE_URL,
    )

    response = await client.chat.completions.create(
        model=settings.OPENAI_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": USER_PROMPT_TEMPLATE.format(content=content)},
        ],
        temperature=0.3,
        response_format={"type": "json_object"},
    )

    return response.choices[0].message.content or ""


async def _call_anthropic(content: str, system_prompt: str) -> str:
    """Call Anthropic API and return raw response text."""
    from anthropic import AsyncAnthropic

    client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    response = await client.messages.create(
        model=settings.ANTHROPIC_MODEL,
        max_tokens=1024,
        system=system_prompt,
        messages=[
            {"role": "user", "content": USER_PROMPT_TEMPLATE.format(content=content)},
        ],
        temperature=0.3,
    )

    # Anthropic returns content blocks
    return response.content[0].text if response.content else ""


# ──────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────

async def analyse_article(content: str, filter_prompt: str = "") -> Optional[LLMAnalysis]:
    """
    Send article content to the configured LLM and return a validated
    LLMAnalysis object, or None if extraction / validation fails.
    filter_prompt: optional additional filtering instructions appended to the system prompt.
    """
    if not content or not content.strip():
        logger.warning("Empty content received, skipping LLM analysis.")
        return None

    # Build system prompt
    system_prompt = SYSTEM_PROMPT
    if filter_prompt and filter_prompt.strip():
        system_prompt = SYSTEM_PROMPT + f"""

═══════════════════════════════════════════════════
【最高优先级】用户自定义筛选规则（必须严格执行）
═══════════════════════════════════════════════════

{filter_prompt.strip()}

═══════════════════════════════════════════════════
【强制执行指令】
═══════════════════════════════════════════════════

1. 上述用户自定义筛选规则是**最高优先级评判标准**，必须严格执行，不得忽视或降低其权重。
2. 在判断 model_selected 时，文章必须同时满足上述所有筛选规则的要求才能设为 true。
3. 与上述筛选规则关联度极低的文章，importance 必须低于 50，model_selected 必须为 false。
4. importance 分数必须直观反映文章在上述筛选规则约束下的价值深度：
   - 完美契合所有规则：importance 80-100
   - 部分契合规则：importance 60-80
   - 边缘相关：importance 40-60
   - 明显不符合规则要求：importance < 40, model_selected = false
5. 严格输出纯 JSON，禁止输出任何额外文字或 markdown 标记。"""

    # Truncate to stay within token budget
    truncated = _truncate_content(content, settings.MAX_CONTENT_TOKENS)

    try:
        provider = settings.LLM_PROVIDER.lower()
        if provider == "openai":
            raw_json = await _call_openai(truncated, system_prompt)
        elif provider == "anthropic":
            raw_json = await _call_anthropic(truncated, system_prompt)
        else:
            logger.error("Unknown LLM provider: %s", provider)
            return None

        logger.debug("Raw LLM response: %s", raw_json[:500])

        # ---- Parse and validate ----
        # Strip potential markdown code fences
        cleaned = raw_json.strip()
        if cleaned.startswith("```"):
            # Remove ```json ... ``` wrapping
            lines = cleaned.split("\n")
            lines = [l for l in lines if not l.strip().startswith("```")]
            cleaned = "\n".join(lines)

        data = json.loads(cleaned)
        analysis = LLMAnalysis.model_validate(data)
        return analysis

    except json.JSONDecodeError as exc:
        logger.error("LLM returned invalid JSON: %s", exc)
        return None
    except Exception as exc:
        logger.error("LLM analysis failed: %s", exc, exc_info=True)
        return None
