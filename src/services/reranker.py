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
            scored.append(
                RerankResult(
                    text=documents[idx]["text"],
                    score=entry["score"],
                    index=idx,
                    metadata=documents[idx].get("metadata", {}),
                )
            )

        scored.sort(key=lambda r: r.score, reverse=True)
        return scored[:top_k]

    async def close(self) -> None:
        """Close the async HTTP client."""
        await self._client.aclose()

    async def __aenter__(self):
        """Async context manager entry."""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.close()
