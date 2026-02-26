from enum import Enum
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class LLMProvider(str, Enum):
    CLAUDE = "claude"
    OPENAI = "openai"
    OLLAMA = "ollama"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # -- LLM --
    llm_provider: LLMProvider = LLMProvider.OLLAMA

    # Claude
    anthropic_api_key: str = ""
    claude_model: str = "claude-sonnet-4-20250514"

    # OpenAI
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"

    # Ollama
    ollama_base_url: str = "http://host.docker.internal:11434"
    ollama_model: str = "llama3.1"

    # -- MinIO --
    minio_endpoint: str = "http://minio:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "documents"

    # -- Qdrant --
    qdrant_url: str = "http://qdrant:6333"
    qdrant_collection: str = "documents"

    # -- Embedding (via Ollama) --
    embedding_model: str = "nomic-embed-text:latest"
    embedding_dim: int = 768

    # -- Reranker --
    reranker_model: str = "jinaai/jina-reranker-v2-base-multilingual"

    # -- Model Server --
    model_server_url: str = "http://model-server:8080"

    # -- Chunking --
    chunk_size: int = 500
    chunk_overlap: int = 100
    parent_chunk_size: int = 2000

    # -- Retrieval --
    retrieval_top_k: int = 15
    retrieval_prefetch_limit: int = 30
    rerank_top_k: int = 7
    rrf_k: int = 40

    # -- Redis --
    redis_url: str = "redis://redis:6379"

    # -- PostgreSQL --
    postgres_url: str = "postgresql://langgraph:langgraph@postgres:5432/langgraph"

    # -- LangGraph API Server --
    langgraph_api_url: str = "http://langgraph-server:8000"

    # -- Ingestion --
    enable_hypothetical_questions: bool = True

    # -- Query --
    enable_hyde: bool = True

    # -- Agent --
    max_retries: int = 3


@lru_cache
def get_settings() -> Settings:
    return Settings()
