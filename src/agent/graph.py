from langgraph.graph import END, StateGraph

from src.agent.nodes import (
    make_generate_node,
    make_grade_documents_node,
    make_rerank_node,
    make_retrieve_node,
    make_rewrite_query_node,
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
    """Build the agentic RAG StateGraph with self-correcting retrieval loop.

    Flow: retrieve -> rerank -> grade_documents
          --[has relevant]--> generate -> END
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

    # Add nodes
    workflow.add_node("retrieve", make_retrieve_node(embedding, qdrant))
    workflow.add_node("rerank", make_rerank_node(reranker))
    workflow.add_node("grade_documents", make_grade_documents_node(llm))
    workflow.add_node("generate", make_generate_node(llm, model_name))
    workflow.add_node("rewrite_query", make_rewrite_query_node(llm))

    # Define edges
    workflow.set_entry_point("retrieve")
    workflow.add_edge("retrieve", "rerank")
    workflow.add_edge("rerank", "grade_documents")
    workflow.add_conditional_edges(
        "grade_documents",
        should_retry,
        {
            "generate": "generate",
            "rewrite": "rewrite_query",
        },
    )
    workflow.add_edge("rewrite_query", "retrieve")
    workflow.add_edge("generate", END)

    return workflow.compile()


async def create_default_graph():
    """Create graph with default services — async initialization for non-blocking setup."""
    settings = get_settings()
    embedding = EmbeddingService(settings)
    qdrant = await QdrantService.create(settings)  # Async factory for Qdrant
    reranker = RerankerService(settings)
    llm = create_llm(settings)
    return build_graph(embedding, qdrant, reranker, llm)
