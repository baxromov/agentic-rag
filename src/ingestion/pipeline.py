import hashlib
import uuid
from datetime import datetime, timezone

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage

from src.config.settings import Settings
from src.ingestion.chunker import chunk_document
from src.ingestion.parser import parse_document
from src.services.embedding import EmbeddingService
from src.services.minio_client import MinioService
from src.services.qdrant_client import QdrantService

_LANG_DETECT_SYSTEM = (
    "You are a language detector. Given a text, respond with ONLY the ISO 639-1 "
    "language code (e.g. 'en', 'ru', 'uz'). No explanation, no punctuation — "
    "just the 2-letter code. Supported languages: English (en), Russian (ru), Uzbek (uz)."
)

_VALID_CODES = {"en", "ru", "uz"}


async def detect_language(text: str, llm: BaseChatModel) -> str:
    """Detect language using an LLM. Returns 'en', 'ru', or 'uz'."""
    sample = text[:300]
    response = await llm.ainvoke([
        SystemMessage(content=_LANG_DETECT_SYSTEM),
        HumanMessage(content=sample),
    ])
    code = response.content.strip().lower()[:2]
    return code if code in _VALID_CODES else "uz"


async def detect_languages_batch(texts: list[str], llm: BaseChatModel) -> list[str]:
    """Detect languages for multiple texts in a single LLM call."""
    if not texts:
        return []

    # Build a numbered list of text samples for one batch call
    samples = []
    for i, t in enumerate(texts, 1):
        samples.append(f"{i}. {t[:200]}")
    joined = "\n".join(samples)

    prompt = (
        f"Detect the language of each numbered text below. "
        f"Respond with ONLY a comma-separated list of ISO 639-1 codes "
        f"(en, ru, or uz) in the same order. No explanation.\n\n{joined}"
    )

    response = await llm.ainvoke([
        SystemMessage(content=_LANG_DETECT_SYSTEM),
        HumanMessage(content=prompt),
    ])

    raw = response.content.strip()
    codes = [c.strip().lower()[:2] for c in raw.split(",")]

    # Validate and pad/truncate to match input length
    result = []
    for i in range(len(texts)):
        if i < len(codes) and codes[i] in _VALID_CODES:
            result.append(codes[i])
        else:
            # Fallback: detect individually
            result.append(await detect_language(texts[i], llm))
    return result


class IngestionPipeline:
    """Orchestrates: MinIO download -> parse -> chunk -> detect language -> embed -> Qdrant upsert."""

    def __init__(
        self,
        settings: Settings,
        minio: MinioService,
        qdrant: QdrantService,
        embedding: EmbeddingService,
        llm: BaseChatModel,
    ) -> None:
        self._settings = settings
        self._minio = minio
        self._qdrant = qdrant
        self._embedding = embedding
        self._llm = llm

    async def ingest_from_bytes(
        self, file_bytes: bytes, filename: str, document_id: str | None = None
    ) -> dict:
        """Ingest a document from raw bytes: upload to MinIO, parse, chunk, embed, index."""
        # Check for duplicate by file content hash
        file_hash = hashlib.sha256(file_bytes).hexdigest()
        existing = await self._qdrant.find_by_file_hash(file_hash)
        if existing:
            return {
                "document_id": existing[0]["document_id"],
                "source": existing[0]["source"],
                "chunks_count": 0,
                "skipped": True,
                "reason": "duplicate",
            }

        document_id = document_id or str(uuid.uuid4())
        minio_key = f"{document_id}/{filename}"

        # Upload to MinIO
        self._minio.upload(minio_key, file_bytes)

        # Parse
        parsed = parse_document(file_bytes, filename)

        # Chunk
        chunks = chunk_document(parsed, self._settings)

        if not chunks:
            return {
                "document_id": document_id,
                "source": minio_key,
                "chunks_count": 0,
            }

        # Detect languages (batch) and embed
        texts = [c.text for c in chunks]
        languages = await detect_languages_batch(texts, self._llm)
        vectors = await self._embedding.embed_documents(texts)
        now = datetime.now(timezone.utc).isoformat()

        payloads = []
        for i, chunk in enumerate(chunks):
            payloads.append({
                "text": chunk.text,
                "document_id": document_id,
                "source": minio_key,
                "file_type": parsed.file_type,
                "file_hash": file_hash,
                "language": languages[i],
                "page_number": chunk.page_number,
                "page_start": chunk.page_start,
                "page_end": chunk.page_end,
                "chunk_index": chunk.chunk_index,
                "created_at": now,
            })

        # Upsert to Qdrant
        point_ids = await self._qdrant.upsert(vectors, payloads)

        return {
            "document_id": document_id,
            "source": minio_key,
            "chunks_count": len(chunks),
            "point_ids": point_ids,
        }

    async def ingest_from_minio(self, minio_key: str, document_id: str | None = None) -> dict:
        """Ingest a document already stored in MinIO."""
        file_bytes = self._minio.download(minio_key)
        filename = minio_key.split("/")[-1]
        return await self.ingest_from_bytes(file_bytes, filename, document_id)

    async def delete_document(self, document_id: str, minio_key: str | None = None) -> None:
        """Delete a document from both Qdrant and optionally MinIO."""
        await self._qdrant.delete_by_document_id(document_id)
        if minio_key:
            self._minio.delete(minio_key)
