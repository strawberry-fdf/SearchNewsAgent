"""
Feishu (飞书) Webhook notification module.
Sends formatted messages when an article is selected.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import time
from typing import Optional

import httpx

from backend.config import settings

logger = logging.getLogger(__name__)

_HTTP_TIMEOUT = 15


def _gen_sign(secret: str, timestamp: int) -> str:
    """Generate HMAC-SHA256 signature for Feishu webhook (if secret is configured)."""
    string_to_sign = f"{timestamp}\n{secret}"
    hmac_code = hmac.new(
        string_to_sign.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).digest()
    return base64.b64encode(hmac_code).decode("utf-8")


async def send_feishu_notification(
    title: str,
    importance: int,
    category: str,
    summary: str,
    url: str,
    tags: list | None = None,
) -> bool:
    """
    Send a rich-text notification to a Feishu group via webhook.

    Returns True if the message was sent successfully.
    """
    webhook_url = settings.FEISHU_WEBHOOK_URL
    if not webhook_url:
        logger.warning("Feishu webhook URL not configured, skipping notification.")
        return False

    tags_str = ", ".join(tags) if tags else ""

    # Build card message
    card_content = {
        "msg_type": "interactive",
        "card": {
            "header": {
                "title": {
                    "tag": "plain_text",
                    "content": f"🔥 [AI热点精选] {title}",
                },
                "template": "red" if importance >= 85 else "green",
            },
            "elements": [
                {
                    "tag": "div",
                    "text": {
                        "tag": "lark_md",
                        "content": (
                            f"📊 **分数**：{importance} | 🏷️ **分类**：{category}\n"
                            f"💡 **摘要**：{summary}\n"
                            f"🏷️ **标签**：{tags_str}"
                        ),
                    },
                },
                {
                    "tag": "action",
                    "actions": [
                        {
                            "tag": "button",
                            "text": {"tag": "plain_text", "content": "🔗 阅读原文"},
                            "type": "primary",
                            "url": url,
                        }
                    ],
                },
            ],
        },
    }

    # Add signature if secret is configured
    if settings.FEISHU_WEBHOOK_SECRET:
        timestamp = int(time.time())
        sign = _gen_sign(settings.FEISHU_WEBHOOK_SECRET, timestamp)
        card_content["timestamp"] = str(timestamp)
        card_content["sign"] = sign

    try:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            resp = await client.post(webhook_url, json=card_content)
            resp.raise_for_status()
            result = resp.json()
            if result.get("code") == 0 or result.get("StatusCode") == 0:
                logger.info("Feishu notification sent: %s", title)
                return True
            else:
                logger.error("Feishu API error: %s", result)
                return False
    except Exception as exc:
        logger.error("Failed to send Feishu notification: %s", exc)
        return False
