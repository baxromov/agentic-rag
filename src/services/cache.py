"""Redis-backed semantic cache for LLM generation results."""
import hashlib
import re

import redis.asyncio as aioredis

from src.config.settings import Settings


class SemanticCache:
    """Cache LLM answers keyed by normalized query + document fingerprint.

    Cache key is content-based: normalize(query) + sorted top-3 doc IDs.
    This avoids stale cache hits after document re-ingestion (doc IDs change)
    while still catching minor query variations (case, punctuation, word order).
    """

    def __init__(self, settings: Settings) -> None:
        self._redis_url = settings.redis_url
        self._ttl = settings.cache_ttl_seconds
        self._enabled = settings.cache_enabled
        self._client: aioredis.Redis | None = None

    async def _get_client(self) -> aioredis.Redis:
        if self._client is None:
            self._client = aioredis.from_url(
                self._redis_url,
                encoding="utf-8",
                decode_responses=True,
            )
        return self._client

    def _make_key(self, query: str, documents: list[dict]) -> str:
        """Create a deterministic cache key from normalized query + doc fingerprint."""
        # Normalize: lowercase, strip punctuation, sort words
        normalized = " ".join(
            sorted(re.sub(r"[^\w\s]", "", query.lower()).split())
        )
        # Doc fingerprint: sorted IDs (or text hashes) of top-3 docs
        doc_ids = sorted([
            d.get("id")
            or hashlib.md5(d.get("text", "").encode()).hexdigest()[:8]
            for d in documents[:3]
        ])
        fingerprint = f"{normalized}|{'|'.join(str(d) for d in doc_ids)}"
        return f"rag_cache:{hashlib.sha256(fingerprint.encode()).hexdigest()[:16]}"

    async def get(self, query: str, documents: list[dict]) -> str | None:
        """Return cached answer or None. Cache errors are silently swallowed."""
        if not self._enabled:
            return None
        try:
            client = await self._get_client()
            return await client.get(self._make_key(query, documents))
        except Exception:
            return None

    async def set(self, query: str, documents: list[dict], answer: str) -> None:
        """Store answer with TTL. Cache write failures are non-fatal."""
        if not self._enabled:
            return
        try:
            client = await self._get_client()
            await client.setex(self._make_key(query, documents), self._ttl, answer)
        except Exception:
            pass

    async def invalidate_all(self) -> int:
        """Delete all rag_cache:* keys (call on document deletion/re-ingestion)."""
        try:
            client = await self._get_client()
            keys = await client.keys("rag_cache:*")
            if keys:
                return await client.delete(*keys)
        except Exception:
            pass
        return 0

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()
