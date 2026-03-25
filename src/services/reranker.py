import math
from dataclasses import dataclass

import httpx

from src.config.settings import Settings


@dataclass
class RerankResult:
    text: str
    score: float
    index: int
    metadata: dict


class RerankerService:
    """Multilingual cross-encoder reranking via model-server (jinaai/jina-reranker-v2-base-multilingual)."""

    def __init__(self, settings: Settings) -> None:
        self._base_url = settings.model_server_url
        self._top_k = settings.rerank_top_k
        self._mmr_lambda = settings.mmr_lambda
        self._client = httpx.AsyncClient(timeout=30.0)

    async def rerank(
        self,
        query: str,
        documents: list[dict],
        top_k: int | None = None,
    ) -> list[RerankResult]:
        top_k = top_k or self._top_k
        texts = [doc["text"] for doc in documents]

        resp = await self._client.post(
            f"{self._base_url}/rerank",
            json={"query": query, "texts": texts, "top_k": top_k},
        )
        resp.raise_for_status()

        scored = []
        for entry in resp.json()["results"]:
            idx = entry["index"]
            # Normalize raw logit to probability [0, 1] via sigmoid
            normalized_score = 1.0 / (1.0 + math.exp(-entry["score"]))
            # Boost scores for Russian/Uzbek to compensate for jina-reranker's English bias
            doc_lang = documents[idx].get("metadata", {}).get("language", "en")
            if doc_lang in ("ru", "uz"):
                normalized_score = min(normalized_score * 1.15, 1.0)
            scored.append(
                RerankResult(
                    text=documents[idx]["text"],
                    score=normalized_score,
                    index=idx,
                    metadata=documents[idx].get("metadata", {}),
                )
            )

        scored.sort(key=lambda r: r.score, reverse=True)
        return self._mmr_select(scored, top_k, self._mmr_lambda)

    def _mmr_select(
        self,
        results: list[RerankResult],
        top_k: int,
        lambda_param: float = 0.7,
    ) -> list[RerankResult]:
        """Select diverse results via Maximal Marginal Relevance.

        Uses character trigram Jaccard similarity as a fast diversity proxy —
        avoids a second embedding call. lambda_param=1.0 means pure relevance,
        0.0 means pure diversity.
        """
        if len(results) <= top_k:
            return results

        def trigram_set(text: str) -> set:
            t = text.lower()
            return {t[i : i + 3] for i in range(len(t) - 2)} if len(t) >= 3 else {t}

        def jaccard(a: set, b: set) -> float:
            if not a or not b:
                return 0.0
            return len(a & b) / len(a | b)

        trigrams = [trigram_set(r.text) for r in results]
        selected: list[int] = [0]  # Always pick highest-scored doc first
        remaining = list(range(1, len(results)))

        while len(selected) < top_k and remaining:
            best_idx = None
            best_score = float("-inf")
            for candidate in remaining:
                rel = results[candidate].score
                max_sim = max(jaccard(trigrams[candidate], trigrams[s]) for s in selected)
                mmr_score = lambda_param * rel - (1 - lambda_param) * max_sim
                if mmr_score > best_score:
                    best_score = mmr_score
                    best_idx = candidate
            selected.append(best_idx)
            remaining.remove(best_idx)

        return [results[i] for i in selected]

    async def close(self) -> None:
        """Close the async HTTP client."""
        await self._client.aclose()

    async def __aenter__(self):
        """Async context manager entry."""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.close()
