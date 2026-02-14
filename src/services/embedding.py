import httpx

from src.config.settings import Settings


class EmbeddingService:
    """Multilingual dense embedding via model-server (intfloat/multilingual-e5-base, 768d)."""

    def __init__(self, settings: Settings) -> None:
        self._base_url = settings.model_server_url
        self._dim = settings.embedding_dim
        self._client = httpx.AsyncClient(timeout=120.0)

    @property
    def dim(self) -> int:
        return self._dim

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        resp = await self._client.post(
            f"{self._base_url}/embed/documents",
            json={"texts": texts},
        )
        resp.raise_for_status()
        return resp.json()["embeddings"]

    async def embed_query(self, text: str) -> list[float]:
        resp = await self._client.post(
            f"{self._base_url}/embed/query",
            json={"text": text},
            timeout=30.0,
        )
        resp.raise_for_status()
        return resp.json()["embedding"]

    async def close(self) -> None:
        """Close the async HTTP client."""
        await self._client.aclose()

    async def __aenter__(self):
        """Async context manager entry."""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.close()
