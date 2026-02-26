import builtins as _builtins

from langgraph.graph import END, StateGraph

from src.agent.nodes import (
    make_expand_context_node,
    make_generate_node,
    make_grade_documents_node,
    make_greeting_response_node,
    make_intent_router_node,
    make_query_prepare_node,
    make_rerank_node,
    make_retrieve_node,
    make_rewrite_query_node,
    route_by_intent,
    should_retry,
)
from src.config.settings import get_settings
from src.models.state import AgentState
from src.services.embedding import EmbeddingService
from src.services.llm import create_llm
from src.services.qdrant_client import QdrantService
from src.services.reranker import RerankerService


def build_graph(
    embedding: EmbeddingService,
    qdrant: QdrantService,
    reranker: RerankerService,
    llm=None,
    model_name: str | None = None,
):
    """Build the agentic RAG StateGraph with intent routing and self-correcting retrieval loop.

    Flow: intent_router
          --[greeting/thanks]--> greeting_response -> END
          --[hr_query]--> query_prepare -> retrieve -> rerank -> grade_documents
              --[has relevant]--> expand_context -> generate -> END
              --[no relevant]--> rewrite_query -> retrieve (max 3 retries)
    """
    settings = get_settings()
    if llm is None:
        llm = create_llm(settings)

    # Determine model name for context window management
    if model_name is None:
        match settings.llm_provider.value:
            case "claude":
                model_name = settings.claude_model
            case "openai":
                model_name = settings.openai_model
            case "ollama":
                model_name = settings.ollama_model
            case _:
                model_name = "gpt-4"  # Fallback

    workflow = StateGraph(AgentState)

    # Add nodes — intent routing (no LLM)
    workflow.add_node("intent_router", make_intent_router_node())
    workflow.add_node("greeting_response", make_greeting_response_node())

    # Add nodes — RAG pipeline
    workflow.add_node("query_prepare", make_query_prepare_node(llm))
    workflow.add_node("retrieve", make_retrieve_node(embedding, qdrant))
    workflow.add_node("rerank", make_rerank_node(reranker))
    workflow.add_node("grade_documents", make_grade_documents_node())
    workflow.add_node("expand_context", make_expand_context_node(qdrant))
    workflow.add_node("generate", make_generate_node(llm, model_name))
    workflow.add_node("rewrite_query", make_rewrite_query_node(llm))

    # Define edges — intent routing entry point
    workflow.set_entry_point("intent_router")
    workflow.add_conditional_edges(
        "intent_router",
        route_by_intent,
        {
            "greeting_response": "greeting_response",
            "rewrite_for_retrieval": "query_prepare",
        },
    )
    workflow.add_edge("greeting_response", END)

    # Define edges — RAG pipeline
    workflow.add_edge("query_prepare", "retrieve")
    workflow.add_edge("retrieve", "rerank")
    workflow.add_edge("rerank", "grade_documents")
    workflow.add_conditional_edges(
        "grade_documents",
        should_retry,
        {
            "generate": "expand_context",
            "rewrite": "rewrite_query",
        },
    )
    workflow.add_edge("expand_context", "generate")
    workflow.add_edge("rewrite_query", "retrieve")
    workflow.add_edge("generate", END)

    return workflow.compile()


async def create_default_graph():
    """Create graph with default services — cached in builtins to survive module reloads."""
    cached = getattr(_builtins, "_rag_cached_graph", None)
    if cached is not None:
        return cached
    settings = get_settings()
    embedding = EmbeddingService(settings)
    qdrant = await QdrantService.create(settings)
    reranker = RerankerService(settings)
    llm = create_llm(settings)
    graph = build_graph(embedding, qdrant, reranker, llm)
    _builtins._rag_cached_graph = graph
    return graph
