"""
LLM 分析引擎 (llm/extractor.py) 单元测试。

覆盖场景:
- 内容截断逻辑
- JSON 解析与容错（code fence 移除）
- OpenAI / Anthropic 提供商路由
- 激活 LLM 配置优先级
- filter_prompt 追加逻辑
- 空内容拦截
- 异常处理：无效 JSON、LLM 调用失败
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.llm.extractor import _truncate_content, analyse_article
from backend.models.article import LLMAnalysis


# ──────────────────────────────────────────────────────────────
# 内容截断测试
# ──────────────────────────────────────────────────────────────

class TestTruncateContent:
    """_truncate_content() 截断逻辑测试。"""

    def test_short_content_unchanged(self):
        """短内容不截断。"""
        text = "Hello World"
        result = _truncate_content(text, 4000)
        assert result == text

    def test_long_content_truncated(self):
        """超长内容被截断并添加截断标记。"""
        text = "A" * 20000
        result = _truncate_content(text, 100)  # 100 tokens -> ~300 chars
        assert len(result) < len(text)
        assert "[...内容已截断...]" in result

    def test_truncation_length(self):
        """截断后长度约为 max_tokens * 3 + 标记长度。"""
        text = "B" * 50000
        max_tokens = 1000
        result = _truncate_content(text, max_tokens)
        # 3000 chars + truncation marker
        assert len(result) < max_tokens * 3 + 50

    def test_exact_boundary_no_truncation(self):
        """恰好等于限制时不截断。"""
        max_tokens = 100
        text = "C" * (max_tokens * 3)
        result = _truncate_content(text, max_tokens)
        assert result == text

    def test_one_over_boundary_truncated(self):
        """超出限制 1 字符时截断。"""
        max_tokens = 100
        text = "D" * (max_tokens * 3 + 1)
        result = _truncate_content(text, max_tokens)
        assert "[...内容已截断...]" in result


# ──────────────────────────────────────────────────────────────
# analyse_article 核心逻辑测试
# ──────────────────────────────────────────────────────────────

class TestAnalyseArticle:
    """analyse_article() 核心函数测试。"""

    @pytest.fixture
    def valid_json_response(self) -> str:
        return json.dumps({
            "title": "AI 新突破",
            "summary": "重要的AI进展",
            "category": "模型发布",
            "ai_relevance": 85,
            "importance": 90,
            "model_selected": True,
            "tags": ["AI", "大模型"],
        }, ensure_ascii=False)

    async def test_empty_content_returns_none(self):
        """空内容直接返回 None，不调用 LLM。"""
        result = await analyse_article("")
        assert result is None

    async def test_whitespace_only_returns_none(self):
        """纯空白内容返回 None。"""
        result = await analyse_article("   \n\t  ")
        assert result is None

    @patch("backend.llm.extractor._call_openai")
    @patch("backend.storage.db.get_active_llm_config", new_callable=AsyncMock)
    async def test_successful_openai_analysis(
        self, mock_db_config, mock_openai, valid_json_response
    ):
        """OpenAI 正常返回有效 JSON 时应解析成功。"""
        mock_db_config.return_value = None  # 无激活配置，走环境变量
        mock_openai.return_value = valid_json_response

        result = await analyse_article("Some article content about AI")

        assert isinstance(result, LLMAnalysis)
        assert result.title == "AI 新突破"
        assert result.ai_relevance == 85
        mock_openai.assert_called_once()

    @patch("backend.llm.extractor._call_anthropic")
    @patch("backend.storage.db.get_active_llm_config", new_callable=AsyncMock)
    async def test_anthropic_provider_routing(self, mock_db_config, mock_anthropic, valid_json_response):
        """当 provider=anthropic 时应调用 Anthropic API。"""
        mock_db_config.return_value = None
        mock_anthropic.return_value = valid_json_response

        with patch("backend.llm.extractor.settings") as mock_settings:
            mock_settings.LLM_PROVIDER = "anthropic"
            mock_settings.MAX_CONTENT_TOKENS = 4000
            mock_settings.ANTHROPIC_API_KEY = "test-key"
            mock_settings.ANTHROPIC_MODEL = "claude-3-5-haiku"

            result = await analyse_article("AI research paper content")

        assert isinstance(result, LLMAnalysis)
        mock_anthropic.assert_called_once()

    @patch("backend.llm.extractor._call_openai")
    @patch("backend.storage.db.get_active_llm_config", new_callable=AsyncMock)
    async def test_active_config_takes_priority(self, mock_db_config, mock_openai, valid_json_response):
        """激活的 LLM 配置应优先于环境变量。"""
        mock_db_config.return_value = {
            "model": "deepseek-v3",
            "api_key": "my-deepseek-key",
            "base_url": "https://api.deepseek.com/v1",
        }
        mock_openai.return_value = valid_json_response

        result = await analyse_article("Article content")

        assert isinstance(result, LLMAnalysis)
        # 验证 _call_openai 接收了正确的配置参数
        call_kwargs = mock_openai.call_args
        assert call_kwargs[1]["api_key"] == "my-deepseek-key" or call_kwargs[0][2] == "my-deepseek-key"

    @patch("backend.llm.extractor._call_openai")
    @patch("backend.storage.db.get_active_llm_config", new_callable=AsyncMock)
    async def test_code_fence_json_stripped(self, mock_db_config, mock_openai):
        """LLM 返回带有 ```json 包裹的 JSON 应正确解析。"""
        mock_db_config.return_value = None
        wrapped = '```json\n{"title":"测试","summary":"摘要","category":"默认","ai_relevance":50,"importance":50,"model_selected":false,"tags":[]}\n```'
        mock_openai.return_value = wrapped

        result = await analyse_article("content")
        assert isinstance(result, LLMAnalysis)
        assert result.title == "测试"

    @patch("backend.llm.extractor._call_openai")
    @patch("backend.storage.db.get_active_llm_config", new_callable=AsyncMock)
    async def test_invalid_json_returns_none(self, mock_db_config, mock_openai):
        """LLM 返回无效 JSON 时应返回 None。"""
        mock_db_config.return_value = None
        mock_openai.return_value = "This is not JSON at all"

        result = await analyse_article("content")
        assert result is None

    @patch("backend.llm.extractor._call_openai")
    @patch("backend.storage.db.get_active_llm_config", new_callable=AsyncMock)
    async def test_llm_call_exception_returns_none(self, mock_db_config, mock_openai):
        """LLM 调用抛异常时应返回 None，不传播异常。"""
        mock_db_config.return_value = None
        mock_openai.side_effect = Exception("API rate limit exceeded")

        result = await analyse_article("content")
        assert result is None

    @patch("backend.llm.extractor._call_openai")
    @patch("backend.storage.db.get_active_llm_config", new_callable=AsyncMock)
    async def test_filter_prompt_appended(self, mock_db_config, mock_openai, valid_json_response):
        """filter_prompt 应追加到 system prompt 中。"""
        mock_db_config.return_value = None
        mock_openai.return_value = valid_json_response

        await analyse_article("content", filter_prompt="只关注 Agent 相关文章")

        # 验证 system_prompt 参数中包含了 filter_prompt
        call_args = mock_openai.call_args
        system_prompt = call_args[0][1]  # 第二个位置参数
        assert "只关注 Agent 相关文章" in system_prompt
        assert "最高优先级" in system_prompt

    @patch("backend.llm.extractor._call_openai")
    @patch("backend.storage.db.get_active_llm_config", new_callable=AsyncMock)
    async def test_empty_filter_prompt_not_appended(self, mock_db_config, mock_openai, valid_json_response):
        """空 filter_prompt 不应追加额外内容。"""
        mock_db_config.return_value = None
        mock_openai.return_value = valid_json_response

        await analyse_article("content", filter_prompt="")

        call_args = mock_openai.call_args
        system_prompt = call_args[0][1]
        assert "最高优先级" not in system_prompt

    @patch("backend.llm.extractor._call_openai")
    @patch("backend.storage.db.get_active_llm_config", new_callable=AsyncMock)
    async def test_validation_error_returns_none(self, mock_db_config, mock_openai):
        """LLM 返回的 JSON 不符合 Schema 时应返回 None。"""
        mock_db_config.return_value = None
        # ai_relevance 超出范围
        mock_openai.return_value = json.dumps({
            "title": "测试", "summary": "摘要",
            "ai_relevance": 999, "importance": 50,
            "model_selected": False,
        })

        result = await analyse_article("content")
        assert result is None

    @patch("backend.storage.db.get_active_llm_config", new_callable=AsyncMock)
    async def test_db_config_error_fallback(self, mock_db_config):
        """获取 DB 配置失败时应降级到环境变量模式。"""
        mock_db_config.side_effect = Exception("DB connection error")

        with patch("backend.llm.extractor._call_openai") as mock_openai:
            mock_openai.return_value = json.dumps({
                "title": "测试", "summary": "摘要",
                "category": "默认", "ai_relevance": 50,
                "importance": 50, "model_selected": False, "tags": [],
            })
            result = await analyse_article("content")
            assert isinstance(result, LLMAnalysis)
