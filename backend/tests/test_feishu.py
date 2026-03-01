"""
飞书通知模块 (notification/feishu.py) 单元测试。

覆盖场景:
- 无 Webhook URL 时跳过发送
- 正常卡片消息构建与发送
- HMAC 签名生成
- 高重要性 / 低重要性的卡片模板差异
- HTTP 请求失败处理
- API 返回错误码处理
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.notification.feishu import _gen_sign, send_feishu_notification


# ──────────────────────────────────────────────────────────────
# 签名生成测试
# ──────────────────────────────────────────────────────────────

class TestGenSign:
    """_gen_sign() HMAC 签名测试。"""

    def test_returns_base64_string(self):
        """签名应返回非空 Base64 字符串。"""
        sign = _gen_sign("test_secret", 1700000000)
        assert isinstance(sign, str)
        assert len(sign) > 0

    def test_deterministic(self):
        """相同输入产生相同签名。"""
        s1 = _gen_sign("secret", 12345)
        s2 = _gen_sign("secret", 12345)
        assert s1 == s2

    def test_different_secret_different_sign(self):
        """不同密钥产生不同签名。"""
        s1 = _gen_sign("secret_a", 12345)
        s2 = _gen_sign("secret_b", 12345)
        assert s1 != s2

    def test_different_timestamp_different_sign(self):
        """不同时间戳产生不同签名。"""
        s1 = _gen_sign("secret", 1000)
        s2 = _gen_sign("secret", 2000)
        assert s1 != s2


# ──────────────────────────────────────────────────────────────
# send_feishu_notification 测试
# ──────────────────────────────────────────────────────────────

class TestSendFeishuNotification:
    """send_feishu_notification() 发送逻辑测试。"""

    @patch("backend.notification.feishu.settings")
    async def test_no_webhook_url_skips(self, mock_settings):
        """未配置 Webhook URL 时直接 return False。"""
        mock_settings.FEISHU_WEBHOOK_URL = ""
        result = await send_feishu_notification(
            title="测试", importance=80, category="模型发布",
            summary="摘要", url="https://example.com",
        )
        assert result is False

    @patch("backend.notification.feishu.httpx.AsyncClient")
    @patch("backend.notification.feishu.settings")
    async def test_successful_send(self, mock_settings, mock_client_cls):
        """正常发送时应返回 True。"""
        mock_settings.FEISHU_WEBHOOK_URL = "https://open.feishu.cn/webhook/xxx"
        mock_settings.FEISHU_WEBHOOK_SECRET = ""

        # 模拟 httpx 响应
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {"code": 0}

        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        result = await send_feishu_notification(
            title="GPT-5 发布", importance=92, category="模型发布",
            summary="OpenAI 重磅发布", url="https://openai.com/blog/gpt-5",
            tags=["GPT-5", "OpenAI"],
        )
        assert result is True
        mock_client.post.assert_called_once()

    @patch("backend.notification.feishu.httpx.AsyncClient")
    @patch("backend.notification.feishu.settings")
    async def test_card_template_high_importance(self, mock_settings, mock_client_cls):
        """importance >= 85 时卡片头应为红色模板。"""
        mock_settings.FEISHU_WEBHOOK_URL = "https://open.feishu.cn/webhook/xxx"
        mock_settings.FEISHU_WEBHOOK_SECRET = ""

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {"code": 0}

        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        await send_feishu_notification(
            title="重大发布", importance=90, category="模型发布",
            summary="摘要", url="https://example.com",
        )

        # 检查实际发送的 JSON body
        call_kwargs = mock_client.post.call_args
        body = call_kwargs[1]["json"]
        assert body["card"]["header"]["template"] == "red"

    @patch("backend.notification.feishu.httpx.AsyncClient")
    @patch("backend.notification.feishu.settings")
    async def test_card_template_low_importance(self, mock_settings, mock_client_cls):
        """importance < 85 时卡片头应为绿色模板。"""
        mock_settings.FEISHU_WEBHOOK_URL = "https://open.feishu.cn/webhook/xxx"
        mock_settings.FEISHU_WEBHOOK_SECRET = ""

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {"code": 0}

        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        await send_feishu_notification(
            title="一般更新", importance=70, category="行业动态/政策监管/其他",
            summary="摘要", url="https://example.com",
        )

        call_kwargs = mock_client.post.call_args
        body = call_kwargs[1]["json"]
        assert body["card"]["header"]["template"] == "green"

    @patch("backend.notification.feishu.httpx.AsyncClient")
    @patch("backend.notification.feishu.settings")
    async def test_signature_included_when_secret_set(self, mock_settings, mock_client_cls):
        """配置了签名密钥时 body 应包含 timestamp 和 sign。"""
        mock_settings.FEISHU_WEBHOOK_URL = "https://open.feishu.cn/webhook/xxx"
        mock_settings.FEISHU_WEBHOOK_SECRET = "my_secret_key"

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {"code": 0}

        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        await send_feishu_notification(
            title="测试", importance=80, category="模型发布",
            summary="摘要", url="https://example.com",
        )

        call_kwargs = mock_client.post.call_args
        body = call_kwargs[1]["json"]
        assert "timestamp" in body
        assert "sign" in body

    @patch("backend.notification.feishu.httpx.AsyncClient")
    @patch("backend.notification.feishu.settings")
    async def test_api_error_returns_false(self, mock_settings, mock_client_cls):
        """飞书 API 返回非 0 错误码时应返回 False。"""
        mock_settings.FEISHU_WEBHOOK_URL = "https://open.feishu.cn/webhook/xxx"
        mock_settings.FEISHU_WEBHOOK_SECRET = ""

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {"code": 19001, "msg": "invalid webhook"}

        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        result = await send_feishu_notification(
            title="测试", importance=80, category="模型发布",
            summary="摘要", url="https://example.com",
        )
        assert result is False

    @patch("backend.notification.feishu.httpx.AsyncClient")
    @patch("backend.notification.feishu.settings")
    async def test_http_exception_returns_false(self, mock_settings, mock_client_cls):
        """HTTP 请求异常时应返回 False，不抛异常。"""
        mock_settings.FEISHU_WEBHOOK_URL = "https://open.feishu.cn/webhook/xxx"
        mock_settings.FEISHU_WEBHOOK_SECRET = ""

        mock_client = AsyncMock()
        mock_client.post.side_effect = Exception("Connection timeout")
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        result = await send_feishu_notification(
            title="测试", importance=80, category="模型发布",
            summary="摘要", url="https://example.com",
        )
        assert result is False

    @patch("backend.notification.feishu.httpx.AsyncClient")
    @patch("backend.notification.feishu.settings")
    async def test_tags_formatted_in_card(self, mock_settings, mock_client_cls):
        """标签应以逗号分隔格式出现在卡片内容中。"""
        mock_settings.FEISHU_WEBHOOK_URL = "https://open.feishu.cn/webhook/xxx"
        mock_settings.FEISHU_WEBHOOK_SECRET = ""

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {"code": 0}

        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        await send_feishu_notification(
            title="测试", importance=80, category="模型发布",
            summary="摘要", url="https://example.com",
            tags=["Agent", "RAG", "多模态"],
        )

        call_kwargs = mock_client.post.call_args
        body = call_kwargs[1]["json"]
        card_text = body["card"]["elements"][0]["text"]["content"]
        assert "Agent, RAG, 多模态" in card_text
