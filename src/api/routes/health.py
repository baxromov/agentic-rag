from fastapi import APIRouter, Depends

from src.api.dependencies import get_minio_service, get_qdrant_service
from src.models.schemas import HealthResponse
from src.services.minio_client import MinioService
from src.services.qdrant_client import QdrantService

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health_check(
    minio: MinioService = Depends(get_minio_service),
    qdrant: QdrantService = Depends(get_qdrant_service),
):
    minio_ok = minio.health_check()
    qdrant_ok = qdrant.health_check()
    collection_info = None
    if qdrant_ok:
        try:
            collection_info = qdrant.collection_info()
        except Exception:
            pass

    status = "healthy" if (minio_ok and qdrant_ok) else "degraded"
    return HealthResponse(
        status=status,
        minio=minio_ok,
        qdrant=qdrant_ok,
        collection_info=collection_info,
    )
