import httpx

from src.config.settings import Settings

BATCH_SIZE = 64
SPARSE_BATCH_SIZE = 128


class SparseVector:
    """Sparse vector with indices and values for BM25/IDF-based search."""

    __slots__ = ("indices", "values")

    def __init__(self, indices: list[int], values: list[float]) -> None:
        self.indices = indices
        self.values = values


class EmbeddingService:
    """Dense embeddings via Ollama + sparse embeddings via model-server (FastEmbed BM25)."""

    def __init__(self, settings: Settings) -> None:
        self._base_url = settings.ollama_base_url
        self._model = settings.embedding_model
        self._dim = settings.embedding_dim
        self._model_server_url = settings.model_server_url
        self._client = httpx.AsyncClient(timeout=300.0)

    @property
    def dim(self) -> int:
        return self._dim

    async def _embed_batch(self, texts: list[str]) -> list[list[float]]:
        resp = await self._client.post(
            f"{self._base_url}/api/embed",
            json={"model": self._model, "input": texts},
        )
        resp.raise_for_status()
        return resp.json()["embeddings"]

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        if len(texts) <= BATCH_SIZE:
            return await self._embed_batch(texts)

        all_embeddings = []
        for i in range(0, len(texts), BATCH_SIZE):
            batch = texts[i : i + BATCH_SIZE]
            embeddings = await self._embed_batch(batch)
            all_embeddings.extend(embeddings)
        return all_embeddings

    async def embed_query(self, text: str) -> list[float]:
        resp = await self._client.post(
            f"{self._base_url}/api/embed",
            json={"model": self._model, "input": text},
            timeout=60.0,
        )
        resp.raise_for_status()
        return resp.json()["embeddings"][0]

    # -- Sparse embeddings via model-server (BM25/IDF) --

    async def _sparse_embed_batch(self, texts: list[str]) -> list[SparseVector]:
        resp = await self._client.post(
            f"{self._model_server_url}/sparse-embed",
            json={"texts": texts},
            timeout=120.0,
        )
        resp.raise_for_status()
        data = resp.json()["embeddings"]
        return [SparseVector(indices=e["indices"], values=e["values"]) for e in data]

    async def sparse_embed_documents(self, texts: list[str]) -> list[SparseVector]:
        """Compute sparse (BM25) embeddings for documents via model-server."""
        if len(texts) <= SPARSE_BATCH_SIZE:
            return await self._sparse_embed_batch(texts)

        all_sparse: list[SparseVector] = []
        for i in range(0, len(texts), SPARSE_BATCH_SIZE):
            batch = texts[i : i + SPARSE_BATCH_SIZE]
            all_sparse.extend(await self._sparse_embed_batch(batch))
        return all_sparse

    async def sparse_embed_query(self, text: str) -> SparseVector:
        """Compute sparse (BM25) embedding for a single query via model-server."""
        results = await self._sparse_embed_batch([text])
        return results[0]

    async def close(self) -> None:
        await self._client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
