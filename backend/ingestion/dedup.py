"""
URL 去重工具模块 —— 基于 SHA-256 哈希生成确定性唯一标识。

去重逻辑:
1. 对 URL 去除首尾空白和末尾斜杠进行标准化
2. 生成 SHA-256 哈希作为数据库唯一键
3. 抓取前先查询哈希是否已存在，避免重复调用 LLM 浪费额度
"""

from __future__ import annotations

import hashlib


def url_hash(url: str) -> str:
    """生成 URL 的确定性 SHA-256 哈希值，用作数据库去重键。"""
    normalized = url.strip().rstrip("/")
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()
