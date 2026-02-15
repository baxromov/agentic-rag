from datetime import datetime

from pydantic import BaseModel, Field


# -- Runtime Context --
class RuntimeContext(BaseModel):
    """User-specific runtime configuration for personalized responses."""

    user_id: str | None = None
    language_preference: str | None = None  # "en", "ru", "uz", "auto"
    expertise_level: str = "general"  # "beginner", "intermediate", "expert", "general"
    response_style: str = "balanced"  # "concise", "detailed", "balanced"
    enable_citations: bool = True
    max_response_length: int | None = None


# -- Documents --
class DocumentUploadResponse(BaseModel):
    document_id: str
    source: str
    chunks_count: int


class DocumentInfo(BaseModel):
    key: str
    size: int
    last_modified: str


class DocumentMetadata(BaseModel):
    document_id: str
    filename: str
    folder: str = "/"  # Virtual folder path
    file_type: str
    size: int
    chunks_count: int
    created_at: str
    last_modified: str
    language: str | None = None


class FolderNode(BaseModel):
    name: str
    path: str
    type: str  # "folder" or "file"
    children: list["FolderNode"] = []
    metadata: DocumentMetadata | None = None


class DocumentListResponse(BaseModel):
    documents: list[DocumentInfo]


class DocumentDeleteResponse(BaseModel):
    document_id: str
    deleted: bool


class KnowledgeBaseResponse(BaseModel):
    total_documents: int
    total_chunks: int
    total_size: int
    documents: list[DocumentMetadata]
    folder_tree: list[FolderNode]


# -- Query --
class QueryRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    filters: dict | None = None
    top_k: int | None = None
    context: RuntimeContext | None = None  # User-specific runtime configuration


class SourceDocument(BaseModel):
    text: str
    score: float | None = None
    page_number: int | None = None
    source: str | None = None
    language: str | None = None


class QueryResponse(BaseModel):
    answer: str
    sources: list[SourceDocument]
    query: str
    retries: int = 0


# -- Health --
class HealthResponse(BaseModel):
    status: str
    minio: bool
    qdrant: bool
    collection_info: dict | None = None


# -- Chat (WebSocket) --
class ChatMessage(BaseModel):
    query: str
    filters: dict | None = None
    context: RuntimeContext | None = None  # User-specific runtime configuration


class ChatEvent(BaseModel):
    event: str  # "node_start", "node_end", "generation", "error"
    node: str | None = None
    data: dict | None = None
