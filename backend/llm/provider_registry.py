"""
LLM 厂商注册表与模型发现。

设计目标：
1) 厂商信息集中管理（名称、默认 base_url、示例模型）。
2) 支持动态拉取模型列表（能拉取则实时，失败则静态兜底）。
3) 兼容多种接口风格：OpenAI 兼容 / Anthropic / Gemini / Ollama。
"""

from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Any, Dict, List, Optional

import httpx


@dataclass(frozen=True)
class ProviderSpec:
    provider: str
    label: str
    default_base_url: str
    docs_url: str
    auth_scheme: str
    discovery_style: str
    static_models: List[str]


PROVIDER_SPECS: Dict[str, ProviderSpec] = {
    "openai": ProviderSpec(
        provider="openai",
        label="OpenAI",
        default_base_url="https://api.openai.com/v1",
        docs_url="https://platform.openai.com/docs/api-reference/models/list",
        auth_scheme="bearer",
        discovery_style="openai_models",
        static_models=["gpt-5", "gpt-5-mini"],
    ),
    "anthropic": ProviderSpec(
        provider="anthropic",
        label="Anthropic",
        default_base_url="https://api.anthropic.com",
        docs_url="https://platform.claude.com/docs/en/api/models-list",
        auth_scheme="x-api-key",
        discovery_style="anthropic_models",
        static_models=["claude-opus-4-1", "claude-sonnet-4"],
    ),
    "deepseek": ProviderSpec(
        provider="deepseek",
        label="DeepSeek",
        default_base_url="https://api.deepseek.com/v1",
        docs_url="https://api-docs.deepseek.com/",
        auth_scheme="bearer",
        discovery_style="openai_models",
        static_models=["deepseek-chat", "deepseek-reasoner"],
    ),
    "zhipu": ProviderSpec(
        provider="zhipu",
        label="智谱 GLM",
        default_base_url="https://open.bigmodel.cn/api/paas/v4",
        docs_url="https://open.bigmodel.cn/dev/api/normal-model/glm-5",
        auth_scheme="bearer",
        discovery_style="openai_models",
        static_models=["glm-5", "glm-4.7"],
    ),
    "minimax": ProviderSpec(
        provider="minimax",
        label="MiniMax",
        default_base_url="https://api.minimaxi.com/v1",
        docs_url="https://platform.minimaxi.com/document/Models",
        auth_scheme="bearer",
        discovery_style="openai_models",
        static_models=["MiniMax-M2.5", "MiniMax-M2.1"],
    ),
    "xai": ProviderSpec(
        provider="xai",
        label="xAI",
        default_base_url="https://api.x.ai/v1",
        docs_url="https://docs.x.ai/developers/rest-api-reference/inference/chat",
        auth_scheme="bearer",
        discovery_style="openai_models",
        static_models=["grok-4", "grok-4-1-fast-reasoning"],
    ),
    "mistral": ProviderSpec(
        provider="mistral",
        label="Mistral",
        default_base_url="https://api.mistral.ai/v1",
        docs_url="https://docs.mistral.ai/api",
        auth_scheme="bearer",
        discovery_style="mistral_models",
        static_models=["mistral-large-latest", "mistral-medium-latest"],
    ),
    "groq": ProviderSpec(
        provider="groq",
        label="Groq",
        default_base_url="https://api.groq.com/openai/v1",
        docs_url="https://console.groq.com/docs/models",
        auth_scheme="bearer",
        discovery_style="openai_models",
        static_models=["llama-3.3-70b-versatile", "deepseek-r1-distill-llama-70b"],
    ),
    "openrouter": ProviderSpec(
        provider="openrouter",
        label="OpenRouter",
        default_base_url="https://openrouter.ai/api/v1",
        docs_url="https://openrouter.ai/docs/api-reference/list-available-models",
        auth_scheme="bearer",
        discovery_style="openrouter_models",
        static_models=["openai/gpt-5", "anthropic/claude-sonnet-4"],
    ),
    "dashscope": ProviderSpec(
        provider="dashscope",
        label="阿里百炼 DashScope",
        default_base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        docs_url="https://help.aliyun.com/zh/model-studio/getting-started/models",
        auth_scheme="bearer",
        discovery_style="openai_models",
        static_models=["qwen3-max", "qwen3.5-plus"],
    ),
    "baichuan": ProviderSpec(
        provider="baichuan",
        label="百川",
        default_base_url="https://api.baichuan-ai.com/v1",
        docs_url="https://platform.baichuan-ai.com/docs/api",
        auth_scheme="bearer",
        discovery_style="openai_models",
        static_models=["Baichuan-M3-Plus", "Baichuan-M3"],
    ),
    "gemini": ProviderSpec(
        provider="gemini",
        label="Google Gemini",
        default_base_url="https://generativelanguage.googleapis.com",
        docs_url="https://ai.google.dev/gemini-api/docs/models",
        auth_scheme="api-key-query",
        discovery_style="gemini_models",
        static_models=["gemini-2.5-pro", "gemini-2.5-flash"],
    ),
    "ollama": ProviderSpec(
        provider="ollama",
        label="Ollama（本地）",
        default_base_url="http://localhost:11434",
        docs_url="https://docs.ollama.com/api",
        auth_scheme="none",
        discovery_style="ollama_models",
        static_models=["deepseek-r1:latest", "llama3.2:latest"],
    ),
}


def list_provider_specs() -> List[Dict[str, Any]]:
    """返回给前端展示用的厂商列表。"""
    items: List[Dict[str, Any]] = []
    for spec in PROVIDER_SPECS.values():
        items.append(
            {
                "provider": spec.provider,
                "label": spec.label,
                "default_base_url": spec.default_base_url,
                "docs_url": spec.docs_url,
                "static_models": spec.static_models,
                "discovery_style": spec.discovery_style,
                "auth_scheme": spec.auth_scheme,
            }
        )
    return items


def get_provider_spec(provider: str) -> Optional[ProviderSpec]:
    return PROVIDER_SPECS.get((provider or "").strip().lower())


def _strip_base_url(base_url: str) -> str:
    value = (base_url or "").strip().rstrip("/")
    return value


def _merge_models(dynamic_models: List[str], fallback: List[str]) -> List[str]:
    merged = []
    seen = set()
    for model in [*dynamic_models, *fallback]:
        if not model:
            continue
        if model in seen:
            continue
        seen.add(model)
        merged.append(model)
    return merged


def _model_rank(model_name: str) -> tuple[int, int, str]:
    value = model_name.lower()
    latest_score = 1 if "latest" in value else 0
    preview_score = 1 if "preview" in value else 0
    date_score = 0
    date_match = re.findall(r"(20\d{2}[\-_]?\d{2}(?:[\-_]?\d{2})?)", value)
    if date_match:
        normalized = date_match[-1].replace("-", "").replace("_", "")
        try:
            date_score = int(normalized)
        except ValueError:
            date_score = 0
    return (latest_score, date_score or preview_score, value)


def _pick_latest_two(models: List[str]) -> List[str]:
    ranked = sorted(models, key=lambda m: _model_rank(m), reverse=True)
    return ranked[:2]


async def _fetch_openai_models(base_url: str, api_key: str, timeout_seconds: float) -> List[str]:
    url = f"{_strip_base_url(base_url)}/models"
    headers = {"Authorization": f"Bearer {api_key}"}
    async with httpx.AsyncClient(timeout=timeout_seconds) as client:
        res = await client.get(url, headers=headers)
        res.raise_for_status()
        payload = res.json()
    data = payload.get("data", []) if isinstance(payload, dict) else []
    return sorted({str(item.get("id", "")).strip() for item in data if isinstance(item, dict) and item.get("id")})


async def _fetch_anthropic_models(base_url: str, api_key: str, timeout_seconds: float) -> List[str]:
    url = f"{_strip_base_url(base_url)}/v1/models"
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
    }
    async with httpx.AsyncClient(timeout=timeout_seconds) as client:
        res = await client.get(url, headers=headers)
        res.raise_for_status()
        payload = res.json()
    data = payload.get("data", []) if isinstance(payload, dict) else []
    return sorted({str(item.get("id", "")).strip() for item in data if isinstance(item, dict) and item.get("id")})


async def _fetch_gemini_models(base_url: str, api_key: str, timeout_seconds: float) -> List[str]:
    root = _strip_base_url(base_url) or "https://generativelanguage.googleapis.com"
    if root.endswith("/v1beta"):
        url = f"{root}/models"
    else:
        url = f"{root}/v1beta/models"
    async with httpx.AsyncClient(timeout=timeout_seconds) as client:
        res = await client.get(url, params={"key": api_key})
        res.raise_for_status()
        payload = res.json()
    models = payload.get("models", []) if isinstance(payload, dict) else []
    names: List[str] = []
    for item in models:
        if not isinstance(item, dict):
            continue
        raw_name = str(item.get("name", "")).strip()
        if raw_name.startswith("models/"):
            raw_name = raw_name.split("models/", 1)[1]
        if raw_name:
            names.append(raw_name)
    return sorted(set(names))


async def _fetch_ollama_models(base_url: str, timeout_seconds: float) -> List[str]:
    url = f"{_strip_base_url(base_url)}/api/tags"
    async with httpx.AsyncClient(timeout=timeout_seconds) as client:
        res = await client.get(url)
        res.raise_for_status()
        payload = res.json()
    models = payload.get("models", []) if isinstance(payload, dict) else []
    names: List[str] = []
    for item in models:
        if not isinstance(item, dict):
            continue
        value = str(item.get("model") or item.get("name") or "").strip()
        if value:
            names.append(value)
    return sorted(set(names))


async def discover_models(
    provider: str,
    api_key: str = "",
    base_url: str = "",
    timeout_seconds: float = 8.0,
) -> Dict[str, Any]:
    """发现厂商可用模型。

    返回：
    {
      provider, models, source(dynamic/static/fallback),
      default_base_url, used_base_url, error
    }
    """
    spec = get_provider_spec(provider)
    if not spec:
        return {
            "provider": provider,
            "models": [],
            "source": "unknown",
            "default_base_url": "",
            "used_base_url": "",
            "error": f"Unsupported provider: {provider}",
        }

    used_base_url = _strip_base_url(base_url) or spec.default_base_url
    api_key = (api_key or "").strip()

    if spec.discovery_style != "ollama_models" and spec.auth_scheme != "none" and not api_key:
        return {
            "provider": spec.provider,
            "models": _pick_latest_two(spec.static_models),
            "source": "static",
            "default_base_url": spec.default_base_url,
            "used_base_url": used_base_url,
            "error": "API key is required for dynamic model discovery",
        }

    try:
        if spec.discovery_style == "openai_models":
            dynamic = await _fetch_openai_models(used_base_url, api_key, timeout_seconds)
        elif spec.discovery_style == "anthropic_models":
            dynamic = await _fetch_anthropic_models(used_base_url, api_key, timeout_seconds)
        elif spec.discovery_style == "gemini_models":
            dynamic = await _fetch_gemini_models(used_base_url, api_key, timeout_seconds)
        elif spec.discovery_style == "ollama_models":
            dynamic = await _fetch_ollama_models(used_base_url, timeout_seconds)
        elif spec.discovery_style == "mistral_models":
            dynamic = await _fetch_openai_models(used_base_url, api_key, timeout_seconds)
        elif spec.discovery_style == "openrouter_models":
            dynamic = await _fetch_openai_models(used_base_url, api_key, timeout_seconds)
        else:
            dynamic = []

        # 动态发现成功时返回全部模型，让用户自己选择
        models = _merge_models(dynamic, spec.static_models) if dynamic else spec.static_models
        return {
            "provider": spec.provider,
            "models": models,
            "source": "dynamic" if dynamic else "fallback",
            "default_base_url": spec.default_base_url,
            "used_base_url": used_base_url,
            "error": None,
        }
    except Exception as exc:
        return {
            "provider": spec.provider,
            "models": _pick_latest_two(spec.static_models),
            "source": "static",
            "default_base_url": spec.default_base_url,
            "used_base_url": used_base_url,
            "error": str(exc),
        }
