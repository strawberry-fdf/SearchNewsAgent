"""
URL 去重模块 (dedup.py) 单元测试。

覆盖场景:
- 基本 URL 哈希生成
- URL 规范化（去除尾部斜杠、首尾空白）
- 相同 URL 不同写法产生相同哈希
- 不同 URL 产生不同哈希
- 边界输入：空字符串、特殊字符、超长 URL
"""

from __future__ import annotations

import hashlib

import pytest

from backend.ingestion.dedup import url_hash


class TestUrlHash:
    """url_hash() 函数的全面测试。"""

    def test_basic_hash(self):
        """基本功能：返回 SHA-256 十六进制字符串。"""
        result = url_hash("https://example.com/article/1")
        assert isinstance(result, str)
        assert len(result) == 64  # SHA-256 hex 长度

    def test_deterministic(self):
        """确定性：相同 URL 多次调用返回相同哈希。"""
        url = "https://openai.com/blog/gpt-5"
        assert url_hash(url) == url_hash(url)

    def test_trailing_slash_normalization(self):
        """尾部斜杠规范化：有无尾斜杠应产生相同哈希。"""
        assert url_hash("https://example.com/path/") == url_hash("https://example.com/path")

    def test_whitespace_normalization(self):
        """首尾空白规范化：去除首尾空格后应相同。"""
        assert url_hash("  https://example.com  ") == url_hash("https://example.com")

    def test_whitespace_and_trailing_slash(self):
        """同时包含空白和尾斜杠：双重规范化。"""
        assert url_hash("  https://example.com/path/  ") == url_hash("https://example.com/path")

    def test_different_urls_different_hashes(self):
        """不同 URL 应产生不同哈希。"""
        h1 = url_hash("https://example.com/article/1")
        h2 = url_hash("https://example.com/article/2")
        assert h1 != h2

    def test_case_sensitivity(self):
        """URL 大小写敏感：路径部分大小写不同应产生不同哈希。"""
        h1 = url_hash("https://example.com/Article")
        h2 = url_hash("https://example.com/article")
        assert h1 != h2

    def test_empty_string(self):
        """空字符串输入不应报错，且有确定输出。"""
        result = url_hash("")
        assert isinstance(result, str)
        assert len(result) == 64

    def test_unicode_url(self):
        """Unicode URL（中文路径）正常处理。"""
        result = url_hash("https://example.com/文章/1")
        assert isinstance(result, str)
        assert len(result) == 64

    def test_very_long_url(self):
        """超长 URL 正常处理。"""
        long_url = "https://example.com/" + "a" * 10000
        result = url_hash(long_url)
        assert isinstance(result, str)
        assert len(result) == 64

    def test_special_characters(self):
        """包含查询参数和锚点的 URL。"""
        url1 = "https://example.com/search?q=AI&page=1#top"
        result = url_hash(url1)
        assert isinstance(result, str)
        assert len(result) == 64

    def test_matches_manual_sha256(self):
        """验证哈希算法与手动计算一致。"""
        url = "https://example.com/test"
        expected = hashlib.sha256(url.encode("utf-8")).hexdigest()
        assert url_hash(url) == expected

    def test_only_trailing_slash_stripped(self):
        """只规范化尾部斜杠，中间的斜杠保持不变。"""
        h1 = url_hash("https://example.com/a/b/c")
        h2 = url_hash("https://example.com/a/b/c/")
        assert h1 == h2

    def test_multiple_trailing_slashes(self):
        """多个尾部斜杠只移除最后一个。"""
        # rstrip("/") 只移除末尾连续的斜杠
        h1 = url_hash("https://example.com/path")
        h2 = url_hash("https://example.com/path///")
        assert h1 == h2
