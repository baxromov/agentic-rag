from collections import defaultdict
from datetime import datetime
from urllib.parse import quote

import math

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response

from src.api.auth_dependencies import get_current_user, require_admin
from src.api.dependencies import get_ingestion_pipeline, get_minio_service, get_qdrant_service
from src.ingestion.pipeline import IngestionPipeline
from src.models.schemas import (
    DocumentDeleteResponse,
    DocumentListResponse,
    DocumentMetadata,
    DocumentUploadResponse,
    FolderNode,
    KnowledgeBaseResponse,
)
from src.services.minio_client import MinioService
from src.services.qdrant_client import QdrantService

router = APIRouter(prefix="/documents", tags=["documents"])


@router.post("/upload", response_model=DocumentUploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    pipeline: IngestionPipeline = Depends(get_ingestion_pipeline),
    _user: dict = Depends(require_admin),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        result = await pipeline.ingest_from_bytes(file_bytes, file.filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return DocumentUploadResponse(
        document_id=result["document_id"],
        source=result["source"],
        chunks_count=result["chunks_count"],
        skipped=result.get("skipped", False),
        reason=result.get("reason"),
    )


@router.get("/", response_model=DocumentListResponse)
async def list_documents(
    minio: MinioService = Depends(get_minio_service),
    _user: dict = Depends(get_current_user),
):
    objects = minio.list_objects()
    return DocumentListResponse(documents=objects)


@router.delete("/{document_id}", response_model=DocumentDeleteResponse)
async def delete_document(
    document_id: str,
    pipeline: IngestionPipeline = Depends(get_ingestion_pipeline),
    minio: MinioService = Depends(get_minio_service),
    _user: dict = Depends(require_admin),
):
    try:
        # Delete vectors from Qdrant
        await pipeline.delete_document(document_id)
        # Delete all files from MinIO for this document
        minio_objects = minio.list_objects(prefix=f"{document_id}/")
        for obj in minio_objects:
            minio.delete(obj["key"])
        return DocumentDeleteResponse(document_id=document_id, deleted=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{document_id}/download")
async def download_document(
    document_id: str,
    minio: MinioService = Depends(get_minio_service),
    _user: dict = Depends(get_current_user),
):
    """Download the original document file by document_id."""
    # List objects under this document's prefix
    objects = minio.list_objects(prefix=f"{document_id}/")
    if not objects:
        raise HTTPException(status_code=404, detail="Document not found")

    # Use the first object (the original file)
    obj_key = objects[0]["key"]
    filename = obj_key.split("/")[-1]

    # Determine content type from extension
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    content_types = {
        "pdf": "application/pdf",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "txt": "text/plain",
        "csv": "text/csv",
    }
    content_type = content_types.get(ext, "application/octet-stream")

    file_bytes = minio.download(obj_key)
    encoded_filename = quote(filename)
    return Response(
        content=file_bytes,
        media_type=content_type,
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}",
        },
    )


@router.get("/{document_id}/preview")
async def preview_document(
    document_id: str,
    minio: MinioService = Depends(get_minio_service),
    _user: dict = Depends(get_current_user),
):
    """Serve the document file inline (e.g. PDF renders in browser)."""
    objects = minio.list_objects(prefix=f"{document_id}/")
    if not objects:
        raise HTTPException(status_code=404, detail="Document not found")

    obj_key = objects[0]["key"]
    filename = obj_key.split("/")[-1]

    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    content_types = {
        "pdf": "application/pdf",
        "txt": "text/plain; charset=utf-8",
        "csv": "text/csv; charset=utf-8",
        "md": "text/markdown; charset=utf-8",
        "html": "text/html; charset=utf-8",
        "htm": "text/html; charset=utf-8",
    }
    content_type = content_types.get(ext, "application/octet-stream")

    file_bytes = minio.download(obj_key)
    encoded_filename = quote(filename)
    return Response(
        content=file_bytes,
        media_type=content_type,
        headers={
            "Content-Disposition": f"inline; filename*=UTF-8''{encoded_filename}",
        },
    )


@router.get("/{document_id}/chunks")
async def get_document_chunks(
    document_id: str,
    qdrant: QdrantService = Depends(get_qdrant_service),
    _user: dict = Depends(get_current_user),
):
    """Get all text chunks for a document from Qdrant."""
    chunks = await qdrant.get_chunks_by_document_id(document_id)
    if not chunks:
        raise HTTPException(status_code=404, detail="No chunks found for this document")
    return {"document_id": document_id, "total_chunks": len(chunks), "chunks": chunks}


@router.get("/knowledge-base", response_model=KnowledgeBaseResponse)
async def get_knowledge_base(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str = Query("", description="Filter documents by filename"),
    sort_by: str = Query("last_modified", description="Sort field: last_modified, filename, size"),
    sort_order: str = Query("desc", description="Sort order: asc or desc"),
    minio: MinioService = Depends(get_minio_service),
    qdrant: QdrantService = Depends(get_qdrant_service),
    _user: dict = Depends(get_current_user),
):
    """Get knowledge base with folder structure and document metadata."""
    # Get all objects from MinIO
    minio_objects = minio.list_objects()

    # Get document metadata from Qdrant
    collection_info = await qdrant.get_collection_info()
    points_count = collection_info.get("points_count", 0)

    # Build document metadata list
    documents_metadata = []
    total_size = 0

    # Group by document_id (first part of key before /)
    doc_groups = defaultdict(list)
    for obj in minio_objects:
        # Extract document_id from key: "doc-id/filename"
        parts = obj["key"].split("/", 1)
        if len(parts) == 2:
            doc_id, filename = parts
            doc_groups[doc_id].append(obj)

    # Count chunks per document from Qdrant
    chunks_per_doc = {}
    try:
        # Scroll through all points to count chunks per document
        scroll_result = await qdrant.scroll_points(limit=1000)
        for point in scroll_result:
            doc_id = point.payload.get("document_id")
            if doc_id:
                chunks_per_doc[doc_id] = chunks_per_doc.get(doc_id, 0) + 1
    except Exception:
        # Fallback: assume 1 chunk per document
        pass

    for doc_id, objects in doc_groups.items():
        # Use first object for metadata
        obj = objects[0]
        filename = obj["key"].split("/")[-1]
        file_type = filename.split(".")[-1].lower() if "." in filename else "unknown"

        chunks_count = chunks_per_doc.get(doc_id, 1)
        size = sum(o["size"] for o in objects)
        total_size += size

        documents_metadata.append(
            DocumentMetadata(
                document_id=doc_id,
                filename=filename,
                folder="/",  # Default to root for now
                file_type=file_type,
                size=size,
                chunks_count=chunks_count,
                created_at=obj["last_modified"],
                last_modified=obj["last_modified"],
            )
        )

    # Filter by search query
    if search.strip():
        search_lower = search.strip().lower()
        documents_metadata = [
            doc for doc in documents_metadata
            if search_lower in doc.filename.lower()
        ]

    # Sort
    reverse = sort_order == "desc"
    if sort_by == "filename":
        documents_metadata.sort(key=lambda d: d.filename.lower(), reverse=reverse)
    elif sort_by == "size":
        documents_metadata.sort(key=lambda d: d.size, reverse=reverse)
    else:  # last_modified
        documents_metadata.sort(key=lambda d: d.last_modified, reverse=reverse)

    # Pagination
    total_filtered = len(documents_metadata)
    total_pages = max(1, math.ceil(total_filtered / page_size))
    page = min(page, total_pages)
    start = (page - 1) * page_size
    end = start + page_size
    paginated_docs = documents_metadata[start:end]

    # Build folder tree structure
    folder_tree = _build_folder_tree(paginated_docs)

    return KnowledgeBaseResponse(
        total_documents=total_filtered,
        total_chunks=points_count,
        total_size=total_size,
        documents=paginated_docs,
        folder_tree=folder_tree,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


def _build_folder_tree(documents: list[DocumentMetadata]) -> list[FolderNode]:
    """Build a tree structure from flat document list."""
    # For now, create a simple flat structure
    # In the future, you can parse folder paths from document metadata
    root_files = []

    for doc in documents:
        root_files.append(
            FolderNode(
                name=doc.filename,
                path=f"/{doc.filename}",
                type="file",
                children=[],
                metadata=doc,
            )
        )

    return root_files
