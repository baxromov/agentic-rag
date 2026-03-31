import uuid

from langchain_core.documents import Document
from langchain_qdrant import FastEmbedSparse, QdrantVectorStore, RetrievalMode
from qdrant_client import AsyncQdrantClient, QdrantClient, models

from src.config.settings import Settings
from src.services.embedding import LangChainDenseAdapter


class QdrantService:
    """Hybrid vector DB: dense + sparse (BM25) via QdrantVectorStore with RRF fusion."""

    def __init__(self, settings: Settings) -> None:
        """Initialize service configuration. Use create() classmethod for async initialization."""
        self._client = None       # AsyncQdrantClient — for direct async ops
        self._sync_client = None  # QdrantClient (sync) — for QdrantVectorStore
        self._vector_store = None
        self._collection = settings.qdrant_collection
        self._dim = settings.embedding_dim
        self._prefetch_limit = settings.retrieval_prefetch_limit
        self._top_k = settings.retrieval_top_k
        self._rrf_k = settings.rrf_k
        self._url = settings.qdrant_url
        self._api_key = settings.qdrant_api_key or None

    @classmethod
    async def create(cls, settings: Settings, dense_embeddings: LangChainDenseAdapter) -> "QdrantService":
        """Async factory method to create and initialize QdrantService."""
        service = cls(settings)
        service._client = AsyncQdrantClient(url=service._url, api_key=service._api_key)
        service._sync_client = QdrantClient(url=service._url, api_key=service._api_key)
        await service._ensure_collection()
        # QdrantVectorStore requires a sync QdrantClient — it calls client.upsert()
        # synchronously inside run_in_executor. Using AsyncQdrantClient here causes
        # upsert() to return an unawaited coroutine and nothing gets indexed.
        service._vector_store = QdrantVectorStore(
            client=service._sync_client,
            collection_name=service._collection,
            embedding=dense_embeddings,
            sparse_embedding=FastEmbedSparse(model_name=settings.sparse_embedding_model),
            retrieval_mode=RetrievalMode.HYBRID,
            vector_name="dense",
            sparse_vector_name="sparse",
            content_payload_key="text",
            metadata_payload_key="metadata",
            validate_collection_config=False,
        )
        return service

    async def _ensure_collection(self) -> None:
        collections = [c.name for c in (await self._client.get_collections()).collections]
        if self._collection in collections:
            return

        await self._client.create_collection(
            collection_name=self._collection,
            vectors_config={
                "dense": models.VectorParams(
                    size=self._dim,
                    distance=models.Distance.COSINE,
                ),
            },
            sparse_vectors_config={
                "sparse": models.SparseVectorParams(
                    modifier=models.Modifier.IDF,
                ),
            },
        )

        # Full-text index on "text" field with multilingual tokenizer
        await self._client.create_payload_index(
            collection_name=self._collection,
            field_name="text",
            field_schema=models.TextIndexParams(
                type=models.TextIndexType.TEXT,
                tokenizer=models.TokenizerType.MULTILINGUAL,
                lowercase=True,
            ),
        )

        # Payload indexes on nested metadata.* fields (QdrantVectorStore format)
        keyword_fields = [
            "document_id", "source", "file_type", "language", "file_hash",
            "section_header", "element_types", "point_type",
        ]
        for field in keyword_fields:
            await self._client.create_payload_index(
                collection_name=self._collection,
                field_name=f"metadata.{field}",
                field_schema=models.PayloadSchemaType.KEYWORD,
            )

        integer_fields = ["page_number", "chunk_index"]
        for field in integer_fields:
            await self._client.create_payload_index(
                collection_name=self._collection,
                field_name=f"metadata.{field}",
                field_schema=models.PayloadSchemaType.INTEGER,
            )

        await self._client.create_payload_index(
            collection_name=self._collection,
            field_name="metadata.created_at",
            field_schema=models.PayloadSchemaType.DATETIME,
        )

    async def upsert(self, documents: list[Document]) -> list[str]:
        """Embed and upsert documents via QdrantVectorStore (dense + BM25 sparse)."""
        ids = [str(uuid.uuid4()) for _ in documents]
        await self._vector_store.aadd_documents(documents, ids=ids)
        return ids

    async def hybrid_search(
        self,
        query: str,
        top_k: int | None = None,
        filters: dict | None = None,
    ) -> list[dict]:
        """Hybrid search via QdrantVectorStore (dense + BM25 sparse, RRF fusion)."""
        results = await self._vector_store.asimilarity_search_with_score(
            query=query,
            k=top_k or self._top_k,
            filter=self._build_filter(filters) if filters else None,
        )
        return [
            {
                "id": doc.metadata.get("_id", ""),
                "score": score,
                "text": doc.page_content,
                "metadata": {k: v for k, v in doc.metadata.items() if k != "_id"},
            }
            for doc, score in results
        ]

    async def find_by_file_hash(self, file_hash: str) -> list[dict]:
        """Find points with a matching file_hash payload."""
        results, _ = await self._client.scroll(
            collection_name=self._collection,
            scroll_filter=models.Filter(
                must=[
                    models.FieldCondition(
                        key="metadata.file_hash",
                        match=models.MatchValue(value=file_hash),
                    )
                ]
            ),
            limit=1,
            with_payload=True,
            with_vectors=False,
        )
        return [
            {
                "id": str(p.id),
                "document_id": p.payload.get("metadata", {}).get("document_id"),
                "source": p.payload.get("metadata", {}).get("source"),
            }
            for p in results
        ]

    async def get_surrounding_chunks(
        self, document_id: str, chunk_index: int, window: int = 1
    ) -> list:
        """Fetch chunks before and after the given chunk from the same document."""
        results, _ = await self._client.scroll(
            collection_name=self._collection,
            scroll_filter=models.Filter(
                must=[
                    models.FieldCondition(
                        key="metadata.document_id",
                        match=models.MatchValue(value=document_id),
                    ),
                    models.FieldCondition(
                        key="metadata.chunk_index",
                        range=models.Range(
                            gte=max(0, chunk_index - window),
                            lte=chunk_index + window,
                        ),
                    ),
                ]
            ),
            limit=2 * window + 1,
            with_payload=True,
            with_vectors=False,
        )
        return sorted(results, key=lambda p: p.payload.get("metadata", {}).get("chunk_index", 0))

    async def get_chunks_by_document_id(self, document_id: str) -> list[dict]:
        """Get all chunks for a document, sorted by chunk_index."""
        all_chunks = []
        offset = None
        while True:
            results, next_offset = await self._client.scroll(
                collection_name=self._collection,
                scroll_filter=models.Filter(
                    must=[
                        models.FieldCondition(
                            key="metadata.document_id",
                            match=models.MatchValue(value=document_id),
                        )
                    ]
                ),
                limit=100,
                offset=offset,
                with_payload=True,
                with_vectors=False,
            )
            for p in results:
                meta = p.payload.get("metadata", {})
                all_chunks.append({
                    "chunk_index": meta.get("chunk_index", 0),
                    "text": p.payload.get("text", ""),
                    "page_number": meta.get("page_number"),
                    "language": meta.get("language"),
                })
            if next_offset is None:
                break
            offset = next_offset
        return sorted(all_chunks, key=lambda c: c["chunk_index"])

    async def delete_by_document_id(self, document_id: str) -> None:
        await self._client.delete(
            collection_name=self._collection,
            points_selector=models.FilterSelector(
                filter=models.Filter(
                    must=[
                        models.FieldCondition(
                            key="metadata.document_id",
                            match=models.MatchValue(value=document_id),
                        )
                    ]
                )
            ),
        )

    async def health_check(self) -> bool:
        try:
            await self._client.get_collections()
            return True
        except Exception:
            return False

    async def collection_info(self) -> dict:
        info = await self._client.get_collection(self._collection)
        return {
            "name": self._collection,
            "points_count": info.points_count,
            "status": info.status.value if hasattr(info.status, "value") else str(info.status),
        }

    async def scroll_points(self, limit: int = 100, offset: str | None = None):
        """Scroll through points in the collection."""
        result = await self._client.scroll(
            collection_name=self._collection, limit=limit, offset=offset
        )
        return result[0]  # Return just the points, not the next offset

    async def close(self) -> None:
        """Close client connections."""
        if self._client:
            await self._client.close()
        if self._sync_client:
            self._sync_client.close()

    @staticmethod
    def _build_filter(filters: dict) -> models.Filter:
        conditions = []
        for key, value in filters.items():
            # Metadata fields are stored nested under "metadata.*"
            field = key if key.startswith("metadata.") else f"metadata.{key}"
            if isinstance(value, dict):
                range_params = {k: v for k, v in value.items() if k in ("gte", "lte", "gt", "lt")}
                conditions.append(
                    models.FieldCondition(key=field, range=models.Range(**range_params))
                )
            else:
                conditions.append(
                    models.FieldCondition(key=field, match=models.MatchValue(value=value))
                )
        return models.Filter(must=conditions)
