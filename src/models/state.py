from typing import TypedDict

from langchain_core.messages import BaseMessage


class AgentState(TypedDict):
    messages: list[BaseMessage]
    query: str
    documents: list[dict]
    generation: str
    filters: dict | None
    context_metadata: dict | None
    runtime_context: dict | None
    intent: str | None
    guardrail_blocked: bool
