"""
LLM Extractor – analyses article content via OpenAI or Anthropic,
returns validated LLMAnalysis objects.

Supports provider switching via config.LLM_PROVIDER.
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

async def _call_openai(content: str) -> str:
    """Call OpenAI API and return raw response text."""
    from openai import AsyncOpenAI

    client = AsyncOpenAI(
        api_key=settings.OPENAI_API_KEY,
        base_url=settings.OPENAI_BASE_URL,
    )

    response = await client.chat.completions.create(
        model=settings.OPENAI_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": USER_PROMPT_TEMPLATE.format(content=content)},
        ],
        temperature=0.3,
        response_format={"type": "json_object"},
    )

    return response.choices[0].message.content or ""


async def _call_anthropic(content: str) -> str:
    """Call Anthropic API and return raw response text."""
    from anthropic import AsyncAnthropic

    client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    response = await client.messages.create(
        model=settings.ANTHROPIC_MODEL,
        max_tokens=1024,
        system=SYSTEM_PROMPT,
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

async def analyse_article(content: str) -> Optional[LLMAnalysis]:
    """
    Send article content to the configured LLM and return a validated
    LLMAnalysis object, or None if extraction / validation fails.
    """
    if not content or not content.strip():
        logger.warning("Empty content received, skipping LLM analysis.")
        return None

    # Truncate to stay within token budget
    truncated = _truncate_content(content, settings.MAX_CONTENT_TOKENS)

    try:
        provider = settings.LLM_PROVIDER.lower()
        if provider == "openai":
            raw_json = await _call_openai(truncated)
        elif provider == "anthropic":
            raw_json = await _call_anthropic(truncated)
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
