from typing import TypedDict

from langchain_core.messages import BaseMessage


class AgentState(TypedDict):
    messages: list[BaseMessage]
    query: str  # Current query (may be rewritten on retry)
    original_query: str  # Preserved unmodified original question
    search_query: str  # Rewritten query optimized for retrieval
    search_queries: list[str] | None  # Multi-query + step-back queries
    inferred_filters: dict | None  # Auto-extracted metadata filters
    documents: list[dict]
    generation: str
    retries: int
    filters: dict | None
    context_metadata: dict | None  # Token usage and context window info
    runtime_context: dict | None  # User-specific runtime configuration
    query_language: str | None  # Detected query language
    intent: str | None  # "greeting", "thanks", "hr_query"
