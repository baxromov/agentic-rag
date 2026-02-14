from functools import lru_cache

from src.config.settings import get_settings
from src.services.embedding import EmbeddingService
from src.services.minio_client import MinioService
from src.services.qdrant_client import QdrantService
from src.services.llm import create_llm
from src.ingestion.pipeline import IngestionPipeline

# Cache for async services
_qdrant_instance: QdrantService | None = None


@lru_cache
def get_embedding_service() -> EmbeddingService:
    return EmbeddingService(get_settings())


@lru_cache
def get_minio_service() -> MinioService:
    return MinioService(get_settings())


async def get_qdrant_service() -> QdrantService:
    """Async dependency for QdrantService with singleton pattern."""
    global _qdrant_instance
    if _qdrant_instance is None:
        _qdrant_instance = await QdrantService.create(get_settings())
    return _qdrant_instance


@lru_cache
def get_llm():
    return create_llm(get_settings())


async def get_ingestion_pipeline() -> IngestionPipeline:
    """Async dependency for IngestionPipeline."""
    return IngestionPipeline(
        settings=get_settings(),
        minio=get_minio_service(),
        qdrant=await get_qdrant_service(),
        embedding=get_embedding_service(),
        llm=get_llm(),
    )
