import uuid

from qdrant_client import AsyncQdrantClient, models

from src.config.settings import Settings


class QdrantService:
    """Hybrid vector DB: dense + sparse (BM25) vectors with Qdrant-native RRF fusion."""

    def __init__(self, settings: Settings) -> None:
        """Initialize service configuration. Use create() classmethod for async initialization."""
        self._client = None
        self._collection = settings.qdrant_collection
        self._dim = settings.embedding_dim
        self._prefetch_limit = settings.retrieval_prefetch_limit
        self._top_k = settings.retrieval_top_k
        self._rrf_k = settings.rrf_k
        self._url = settings.qdrant_url

    @classmethod
    async def create(cls, settings: Settings) -> "QdrantService":
        """Async factory method to create and initialize QdrantService."""
        service = cls(settings)
        service._client = AsyncQdrantClient(url=service._url)
        await service._ensure_collection()
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

        # Payload indexes for filtering
        keyword_fields = [
            "document_id", "source", "file_type", "language", "file_hash",
            "section_header", "element_types", "point_type",
        ]
        for field in keyword_fields:
            await self._client.create_payload_index(
                collection_name=self._collection,
                field_name=field,
                field_schema=models.PayloadSchemaType.KEYWORD,
            )

        integer_fields = ["page_number", "chunk_index"]
        for field in integer_fields:
            await self._client.create_payload_index(
                collection_name=self._collection,
                field_name=field,
                field_schema=models.PayloadSchemaType.INTEGER,
            )

        await self._client.create_payload_index(
            collection_name=self._collection,
            field_name="created_at",
            field_schema=models.PayloadSchemaType.DATETIME,
        )

    async def ensure_indexes(self) -> None:
        """Idempotently create all payload indexes (safe for existing collections)."""
        keyword_fields = [
            "document_id", "source", "file_type", "language", "file_hash",
            "section_header", "element_types", "point_type",
        ]
        for field in keyword_fields:
            try:
                await self._client.create_payload_index(
                    collection_name=self._collection,
                    field_name=field,
                    field_schema=models.PayloadSchemaType.KEYWORD,
                )
            except Exception:
                pass  # Index already exists

        integer_fields = ["page_number", "chunk_index", "parent_chunk_index"]
        for field in integer_fields:
            try:
                await self._client.create_payload_index(
                    collection_name=self._collection,
                    field_name=field,
                    field_schema=models.PayloadSchemaType.INTEGER,
                )
            except Exception:
                pass

        try:
            await self._client.create_payload_index(
                collection_name=self._collection,
                field_name="text",
                field_schema=models.TextIndexParams(
                    type=models.TextIndexType.TEXT,
                    tokenizer=models.TokenizerType.MULTILINGUAL,
                    lowercase=True,
                ),
            )
        except Exception:
            pass

        try:
            await self._client.create_payload_index(
                collection_name=self._collection,
                field_name="created_at",
                field_schema=models.PayloadSchemaType.DATETIME,
            )
        except Exception:
            pass

    async def upsert(
        self,
        vectors: list[list[float]],
        payloads: list[dict],
        sparse_vectors: list | None = None,
    ) -> list[str]:
        ids = [str(uuid.uuid4()) for _ in vectors]
        points = []
        for i in range(len(vectors)):
            vector_data: dict = {"dense": vectors[i]}
            if sparse_vectors and i < len(sparse_vectors):
                sv = sparse_vectors[i]
                vector_data["sparse"] = models.SparseVector(
                    indices=sv.indices, values=sv.values,
                )
            points.append(
                models.PointStruct(id=ids[i], vector=vector_data, payload=payloads[i])
            )
        await self._client.upsert(collection_name=self._collection, points=points)
        return ids

    async def hybrid_search(
        self,
        query_vector: list[float],
        query_text: str,
        top_k: int | None = None,
        filters: dict | None = None,
        sparse_vector: object | None = None,
    ) -> list[dict]:
        """Hybrid search: dense + sparse with Qdrant-native RRF fusion.

        Uses Qdrant's built-in FusionQuery with Prefetch for proper ranked fusion.
        If sparse_vector is provided, uses BM25-based sparse search.
        Otherwise falls back to dense-only search.
        """
        top_k = top_k or self._top_k
        query_filter = self._build_filter(filters) if filters else None

        prefetch = [
            models.Prefetch(
                query=query_vector,
                using="dense",
                limit=self._prefetch_limit,
                filter=query_filter,
            ),
        ]

        if sparse_vector is not None:
            prefetch.append(
                models.Prefetch(
                    query=models.SparseVector(
                        indices=sparse_vector.indices,
                        values=sparse_vector.values,
                    ),
                    using="sparse",
                    limit=self._prefetch_limit,
                    filter=query_filter,
                ),
            )

        results = await self._client.query_points(
            collection_name=self._collection,
            prefetch=prefetch,
            query=models.FusionQuery(fusion=models.Fusion.RRF, rrf=models.RRFParams(k=self._rrf_k)),
            limit=top_k,
            with_payload=True,
        )

        return [
            {
                "id": str(point.id),
                "score": point.score,
                "text": point.payload.get("text", ""),
                "metadata": {k: v for k, v in point.payload.items() if k != "text"},
            }
            for point in results.points
        ]

    async def dense_search(
        self,
        query_vector: list[float],
        top_k: int | None = None,
        filters: dict | None = None,
    ) -> list[dict]:
        top_k = top_k or self._top_k
        query_filter = self._build_filter(filters) if filters else None

        results = await self._client.query_points(
            collection_name=self._collection,
            query=query_vector,
            using="dense",
            limit=top_k,
            query_filter=query_filter,
        )

        return [
            {
                "id": str(point.id),
                "score": point.score,
                "text": point.payload.get("text", ""),
                "metadata": {k: v for k, v in point.payload.items() if k != "text"},
            }
            for point in results.points
        ]

    async def find_by_file_hash(self, file_hash: str) -> list[dict]:
        """Find points with a matching file_hash payload."""
        results, _ = await self._client.scroll(
            collection_name=self._collection,
            scroll_filter=models.Filter(
                must=[
                    models.FieldCondition(
                        key="file_hash",
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
                "document_id": p.payload.get("document_id"),
                "source": p.payload.get("source"),
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
                        key="document_id",
                        match=models.MatchValue(value=document_id),
                    ),
                    models.FieldCondition(
                        key="chunk_index",
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
        return sorted(results, key=lambda p: p.payload.get("chunk_index", 0))

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
                            key="document_id",
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
                all_chunks.append({
                    "chunk_index": p.payload.get("chunk_index", 0),
                    "text": p.payload.get("text", ""),
                    "page_number": p.payload.get("page_number"),
                    "language": p.payload.get("language"),
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
                            key="document_id",
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

    async def get_collection_info(self) -> dict:
        """Alias for collection_info for compatibility."""
        return await self.collection_info()

    async def scroll_points(self, limit: int = 100, offset: str | None = None):
        """Scroll through points in the collection."""
        result = await self._client.scroll(
            collection_name=self._collection, limit=limit, offset=offset
        )
        return result[0]  # Return just the points, not the next offset

    async def close(self) -> None:
        """Close the async client connection."""
        if self._client:
            await self._client.close()

    @staticmethod
    def _build_filter(filters: dict) -> models.Filter:
        conditions = []
        for key, value in filters.items():
            if isinstance(value, dict):
                range_params = {}
                if "gte" in value:
                    range_params["gte"] = value["gte"]
                if "lte" in value:
                    range_params["lte"] = value["lte"]
                if "gt" in value:
                    range_params["gt"] = value["gt"]
                if "lt" in value:
                    range_params["lt"] = value["lt"]
                conditions.append(
                    models.FieldCondition(
                        key=key,
                        range=models.Range(**range_params),
                    )
                )
            else:
                conditions.append(
                    models.FieldCondition(
                        key=key,
                        match=models.MatchValue(value=value),
                    )
                )
        return models.Filter(must=conditions)
