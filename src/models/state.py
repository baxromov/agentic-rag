from typing import TypedDict

from langchain_core.messages import BaseMessage


class AgentState(TypedDict):
    messages: list[BaseMessage]
    query: str
    documents: list[dict]
    generation: str
    retries: int
    filters: dict | None
    context_metadata: dict | None  # Token usage and context window info
    runtime_context: dict | None  # User-specific runtime configuration
    query_language: str | None  # Detected query language
