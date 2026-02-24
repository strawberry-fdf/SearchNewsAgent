"""
Deduplication utilities – URL hash generation and Bloom-filter-like
fast-path check before hitting MongoDB.
"""

from __future__ import annotations

import hashlib


def url_hash(url: str) -> str:
    """Return a deterministic SHA-256 hex digest for a given URL."""
    normalized = url.strip().rstrip("/")
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()
