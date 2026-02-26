import asyncio
import uuid

from qdrant_client import AsyncQdrantClient, models

from src.config.settings import Settings


class QdrantService:
    """Hybrid vector DB: dense vectors + full-text index with RRF fusion."""

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
            vectors_config=models.VectorParams(
                size=self._dim,
                distance=models.Distance.COSINE,
            ),
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

    async def upsert(self, vectors: list[list[float]], payloads: list[dict]) -> list[str]:
        ids = [str(uuid.uuid4()) for _ in vectors]
        points = [
            models.PointStruct(id=ids[i], vector=vectors[i], payload=payloads[i])
            for i in range(len(vectors))
        ]
        await self._client.upsert(collection_name=self._collection, points=points)
        return ids

    async def hybrid_search(
        self,
        query_vector: list[float],
        query_text: str,
        top_k: int | None = None,
        filters: dict | None = None,
    ) -> list[dict]:
        """Hybrid search: dense + full-text in parallel, fused with RRF."""
        top_k = top_k or self._top_k
        query_filter = self._build_filter(filters) if filters else None

        # Build full-text filter
        text_filter_conditions = [
            models.FieldCondition(
                key="text",
                match=models.MatchText(text=query_text),
            )
        ]
        if query_filter and query_filter.must:
            text_filter_conditions.extend(query_filter.must)

        # Run dense + full-text search in parallel
        dense_coro = self._client.query_points(
            collection_name=self._collection,
            query=query_vector,
            limit=self._prefetch_limit,
            query_filter=query_filter,
        )
        text_coro = self._client.scroll(
            collection_name=self._collection,
            scroll_filter=models.Filter(must=text_filter_conditions),
            limit=self._prefetch_limit,
            with_payload=True,
            with_vectors=False,
        )

        dense_results, (text_results, _) = await asyncio.gather(dense_coro, text_coro)

        # RRF fusion
        return self._rrf_fuse(dense_results.points, text_results, top_k)

    def _rrf_fuse(self, dense_points, text_points, top_k: int) -> list[dict]:
        """Reciprocal Rank Fusion of dense and text search results."""
        scores: dict[str, float] = {}
        point_data: dict[str, dict] = {}

        # Score dense results by rank
        for rank, point in enumerate(dense_points):
            pid = str(point.id)
            scores[pid] = scores.get(pid, 0.0) + 1.0 / (self._rrf_k + rank + 1)
            if pid not in point_data:
                point_data[pid] = {
                    "id": pid,
                    "text": point.payload.get("text", ""),
                    "metadata": {k: v for k, v in point.payload.items() if k != "text"},
                }

        # Score text results by rank
        for rank, point in enumerate(text_points):
            pid = str(point.id)
            scores[pid] = scores.get(pid, 0.0) + 1.0 / (self._rrf_k + rank + 1)
            if pid not in point_data:
                point_data[pid] = {
                    "id": pid,
                    "text": point.payload.get("text", ""),
                    "metadata": {k: v for k, v in point.payload.items() if k != "text"},
                }

        # Sort by fused score and return top_k
        sorted_ids = sorted(scores.keys(), key=lambda x: scores[x], reverse=True)
        results = []
        for pid in sorted_ids[:top_k]:
            entry = point_data[pid]
            entry["score"] = scores[pid]
            results.append(entry)
        return results

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
