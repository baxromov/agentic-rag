import httpx

from src.config.settings import Settings


class EmbeddingService:
    """Dense embeddings via Ollama (nomic-embed-text)."""

    def __init__(self, settings: Settings) -> None:
        self._base_url = settings.ollama_base_url
        self._model = settings.embedding_model
        self._dim = settings.embedding_dim
        self._client = httpx.AsyncClient(timeout=120.0)

    @property
    def dim(self) -> int:
        return self._dim

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        resp = await self._client.post(
            f"{self._base_url}/api/embed",
            json={"model": self._model, "input": texts},
        )
        resp.raise_for_status()
        return resp.json()["embeddings"]

    async def embed_query(self, text: str) -> list[float]:
        resp = await self._client.post(
            f"{self._base_url}/api/embed",
            json={"model": self._model, "input": text},
            timeout=30.0,
        )
        resp.raise_for_status()
        return resp.json()["embeddings"][0]

    async def close(self) -> None:
        await self._client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
