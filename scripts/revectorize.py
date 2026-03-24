"""
Re-vectorize all documents: drop Qdrant collection, re-ingest from MinIO.

Run inside the fastapi container:
    docker compose exec fastapi python scripts/revectorize.py
"""
import asyncio
import sys

from qdrant_client import AsyncQdrantClient

from src.config.settings import get_settings
from src.ingestion.pipeline import IngestionPipeline
from src.services.embedding import LangChainDenseAdapter
from src.services.minio_client import MinioService
from src.services.qdrant_client import QdrantService
from src.services.llm import create_llm


async def main() -> None:
    settings = get_settings()

    print("=== Re-vectorize: drop collection + re-ingest from MinIO ===\n")

    # 1. Drop existing Qdrant collection to force recreation with new metadata.* format
    raw_client = AsyncQdrantClient(url=settings.qdrant_url)
    collections = [c.name for c in (await raw_client.get_collections()).collections]
    if settings.qdrant_collection in collections:
        await raw_client.delete_collection(settings.qdrant_collection)
        print(f"Dropped collection: {settings.qdrant_collection}")
    else:
        print(f"Collection '{settings.qdrant_collection}' does not exist, skipping drop.")
    await raw_client.close()

    # 2. Init services (QdrantService.create() will recreate the collection with correct schema)
    dense = LangChainDenseAdapter(settings)
    qdrant = await QdrantService.create(settings, dense)
    minio = MinioService(settings)
    llm = create_llm(settings)
    pipeline = IngestionPipeline(settings=settings, minio=minio, qdrant=qdrant, llm=llm)

    print("Collection recreated with new schema.\n")

    # 3. List all objects in MinIO and re-ingest each unique document
    all_objects = minio.list_objects()
    if not all_objects:
        print("No documents found in MinIO. Nothing to re-ingest.")
        return

    # Group by document_id (first path segment: <document_id>/<filename>)
    seen_doc_ids: set[str] = set()
    to_ingest: list[dict] = []
    for obj in all_objects:
        parts = obj["key"].split("/", 1)
        if len(parts) != 2:
            continue
        doc_id, filename = parts
        if doc_id not in seen_doc_ids:
            seen_doc_ids.add(doc_id)
            to_ingest.append({"key": obj["key"], "doc_id": doc_id, "filename": filename})

    print(f"Found {len(to_ingest)} document(s) to re-ingest.\n")

    total_chunks = 0
    failed = 0
    for i, doc in enumerate(to_ingest, 1):
        print(f"[{i}/{len(to_ingest)}] {doc['filename']} (id={doc['doc_id']}) ... ", end="", flush=True)
        try:
            result = await pipeline.ingest_from_minio(doc["key"], document_id=doc["doc_id"])
            chunks = result.get("chunks_count", 0)
            total_chunks += chunks
            print(f"{chunks} chunks")
        except Exception as e:
            print(f"FAILED: {e}")
            failed += 1

    print(f"\n=== Done: {len(to_ingest) - failed} succeeded, {failed} failed, {total_chunks} total chunks ===")


if __name__ == "__main__":
    asyncio.run(main())
