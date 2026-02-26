import hashlib
import uuid
from datetime import datetime, timezone

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage
from langdetect import detect as _langdetect_detect
from langdetect import LangDetectException

from src.config.settings import Settings
from src.ingestion.chunker import chunk_document
from src.ingestion.parser import parse_document
from src.services.embedding import EmbeddingService
from src.services.minio_client import MinioService
from src.services.qdrant_client import QdrantService

_VALID_CODES = {"en", "ru", "uz"}

# langdetect often confuses Uzbek Latin with Turkish
_LANG_MAP = {"tr": "uz"}


def detect_language(text: str) -> str:
    """Detect language using langdetect. Returns 'en', 'ru', or 'uz'."""
    sample = text[:500]
    if not sample.strip():
        return "uz"
    try:
        code = _langdetect_detect(sample)
        code = _LANG_MAP.get(code, code)
        return code if code in _VALID_CODES else "uz"
    except LangDetectException:
        return "uz"


def detect_languages_batch(texts: list[str]) -> list[str]:
    """Detect languages for multiple texts using langdetect (no LLM needed)."""
    if not texts:
        return []
    return [detect_language(t) for t in texts]


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
        languages = detect_languages_batch(texts)

        # Contextual chunk headers: prepend section_header for embedding only
        embedding_texts = []
        for c in chunks:
            if c.section_header:
                embedding_texts.append(f"{c.section_header}\n\n{c.text}")
            else:
                embedding_texts.append(c.text)
        vectors = await self._embedding.embed_documents(embedding_texts)
        now = datetime.now(timezone.utc).isoformat()

        payloads = []
        for i, chunk in enumerate(chunks):
            payloads.append({
                "text": chunk.text,
                "parent_text": chunk.parent_chunk_text,
                "parent_chunk_index": chunk.parent_chunk_index,
                "point_type": "chunk",
                "document_id": document_id,
                "source": minio_key,
                "file_type": parsed.file_type,
                "file_hash": file_hash,
                "language": languages[i],
                "page_number": chunk.page_number,
                "page_start": chunk.page_start,
                "page_end": chunk.page_end,
                "chunk_index": chunk.chunk_index,
                "section_header": chunk.section_header,
                "element_types": chunk.element_types,
                "created_at": now,
            })

        # Upsert to Qdrant
        point_ids = await self._qdrant.upsert(vectors, payloads)

        # Hypothetical question embeddings (per unique parent chunk)
        hq_count = 0
        if self._settings.enable_hypothetical_questions:
            seen_parents: set[int] = set()
            for chunk in chunks:
                if chunk.parent_chunk_index in seen_parents:
                    continue
                seen_parents.add(chunk.parent_chunk_index)

                try:
                    questions = await self._generate_hypothetical_questions(
                        chunk.parent_chunk_text
                    )
                    if not questions:
                        continue

                    q_vectors = await self._embedding.embed_documents(questions)
                    q_payloads = [
                        {
                            "text": q,
                            "parent_text": chunk.parent_chunk_text,
                            "parent_chunk_index": chunk.parent_chunk_index,
                            "point_type": "hypothetical_question",
                            "document_id": document_id,
                            "source": minio_key,
                            "file_type": parsed.file_type,
                            "file_hash": file_hash,
                            "language": detect_language(q),
                            "section_header": chunk.section_header,
                            "created_at": now,
                        }
                        for q in questions
                    ]
                    await self._qdrant.upsert(q_vectors, q_payloads)
                    hq_count += len(questions)
                except Exception as e:
                    print(f"Hypothetical question generation failed for parent {chunk.parent_chunk_index}: {e}")

        return {
            "document_id": document_id,
            "source": minio_key,
            "chunks_count": len(chunks),
            "hypothetical_questions_count": hq_count,
            "point_ids": point_ids,
        }

    async def _generate_hypothetical_questions(self, parent_text: str) -> list[str]:
        """Generate questions this chunk could answer (HyDE-style)."""
        messages = [
            SystemMessage(
                content=(
                    "Generate exactly 3 questions that the following HR policy text could answer. "
                    "Return ONLY the questions, one per line, no numbering, no extra text."
                )
            ),
            HumanMessage(content=parent_text[:1500]),
        ]
        response = await self._llm.ainvoke(messages)
        questions = [q.strip() for q in response.content.strip().split("\n") if q.strip()]
        return questions[:3]

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
