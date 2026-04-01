import builtins as _builtins

from langgraph.graph import END, StateGraph

from src.agent.langchain_guardrails import make_input_safety_node, route_by_safety
from src.agent.nodes import (
    make_general_response_node,
    make_generate_node,
    make_greeting_response_node,
    make_intent_router_node,
    make_retrieve_node,
    route_by_intent,
)
from src.config.settings import get_settings
from src.models.state import AgentState
from src.services.embedding import LangChainDenseAdapter
from src.services.llm import create_llm
from src.services.qdrant_client import QdrantService


def build_graph(qdrant: QdrantService, llm=None, checkpointer=None):
    """Build simplified agentic RAG graph.

    Flow: input_safety → intent_router
          → greeting_response → END
          → general_response  → END
          → retrieve → generate → END
    """
    settings = get_settings()
    if llm is None:
        llm = create_llm(settings)

    workflow = StateGraph(AgentState)

    workflow.add_node("input_safety", make_input_safety_node(llm))
    workflow.add_node("intent_router", make_intent_router_node(llm))
    workflow.add_node("greeting_response", make_greeting_response_node())
    workflow.add_node("general_response", make_general_response_node(llm))
    workflow.add_node("retrieve", make_retrieve_node(qdrant))
    workflow.add_node("generate", make_generate_node(llm))

    workflow.set_entry_point("input_safety")
    workflow.add_conditional_edges(
        "input_safety",
        route_by_safety,
        {"blocked": END, "safe": "intent_router"},
    )
    workflow.add_conditional_edges(
        "intent_router",
        route_by_intent,
        {
            "greeting_response": "greeting_response",
            "general_response": "general_response",
            "retrieve": "retrieve",
        },
    )
    workflow.add_edge("greeting_response", END)
    workflow.add_edge("general_response", END)
    workflow.add_edge("retrieve", "generate")
    workflow.add_edge("generate", END)

    return workflow.compile(checkpointer=checkpointer)


async def create_default_graph(checkpointer=None):
    """Create graph with default services — cached in builtins to survive module reloads."""
    cached = getattr(_builtins, "_rag_cached_graph", None)
    if cached is not None:
        return cached

    settings = get_settings()
    qdrant = await QdrantService.create(settings, LangChainDenseAdapter(settings))
    llm = create_llm(settings)
    graph = build_graph(qdrant, llm, checkpointer=checkpointer)

    _builtins._rag_cached_graph = graph
    return graph
