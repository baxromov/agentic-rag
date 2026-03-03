import builtins as _builtins

from langgraph.graph import END, StateGraph
from langgraph.types import interrupt

from src.agent.langchain_guardrails import (
    make_input_safety_node,
    make_output_safety_node,
    route_by_safety,
)
from src.agent.nodes import (
    make_expand_context_node,
    make_general_response_node,
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
from src.utils.telemetry import logger


def make_human_feedback_node():
    """Create a node that pauses the graph for human clarification via LangGraph interrupt."""

    async def human_feedback(state):
        if state.get("needs_clarification"):
            question = state.get("clarification_question", "Could you clarify?")
            response = interrupt(question)
            # After resume, combine user response with original query
            return {
                "human_response": response,
                "needs_clarification": False,
                "clarification_question": None,
                "query": f"{state['query']} ({response})",
                "search_query": f"{state['query']} ({response})",
                "search_queries": [f"{state['query']} ({response})"],
                "documents": [],  # Clear docs to trigger re-retrieval
                "retries": 0,
            }
        return {}

    return human_feedback


def build_graph(
    embedding: EmbeddingService,
    qdrant: QdrantService,
    reranker: RerankerService,
    llm=None,
    model_name: str | None = None,
    checkpointer=None,
):
    """Build the agentic RAG StateGraph with LangChain guardrails and self-correcting retrieval.

    Flow: input_safety (LangChain LLM guardrail)
          --[blocked]--> END (canned safe response)
          --[safe]--> intent_router
              --[greeting/thanks]--> greeting_response -> END
              --[general_query]--> general_response -> output_safety -> END
              --[hr_query]--> query_prepare -> retrieve -> rerank -> grade_documents
                  --[has relevant]--> expand_context -> generate -> output_safety -> END
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

    # Add nodes — LangChain guardrails (LLM-based input/output safety checks)
    workflow.add_node("input_safety", make_input_safety_node(llm))
    workflow.add_node("output_safety", make_output_safety_node(llm))

    # Add nodes — intent routing (LLM classifies hr_query vs general_query)
    workflow.add_node("intent_router", make_intent_router_node(llm))
    workflow.add_node("greeting_response", make_greeting_response_node())
    workflow.add_node("general_response", make_general_response_node(llm))

    # Add nodes — RAG pipeline
    workflow.add_node("query_prepare", make_query_prepare_node(llm))
    workflow.add_node("retrieve", make_retrieve_node(embedding, qdrant))
    workflow.add_node("rerank", make_rerank_node(reranker))
    workflow.add_node("grade_documents", make_grade_documents_node())
    workflow.add_node("human_feedback", make_human_feedback_node())
    workflow.add_node("expand_context", make_expand_context_node(qdrant))
    workflow.add_node("generate", make_generate_node(llm, model_name))
    workflow.add_node("rewrite_query", make_rewrite_query_node(llm))

    # Define edges — input guardrail as entry point
    workflow.set_entry_point("input_safety")
    workflow.add_conditional_edges(
        "input_safety",
        route_by_safety,
        {
            "blocked": END,  # Blocked queries get a canned response, skip all processing
            "safe": "intent_router",
        },
    )

    # Define edges — intent routing
    workflow.add_conditional_edges(
        "intent_router",
        route_by_intent,
        {
            "greeting_response": "greeting_response",
            "general_response": "general_response",
            "rewrite_for_retrieval": "query_prepare",
        },
    )
    workflow.add_edge("greeting_response", END)
    workflow.add_edge("general_response", "output_safety")  # Output guardrail check

    # Define edges — RAG pipeline
    workflow.add_edge("query_prepare", "retrieve")
    workflow.add_edge("retrieve", "rerank")
    workflow.add_edge("rerank", "grade_documents")
    workflow.add_edge("grade_documents", "human_feedback")
    workflow.add_conditional_edges(
        "human_feedback",
        should_retry,
        {
            "generate": "expand_context",
            "rewrite": "rewrite_query",
        },
    )
    workflow.add_edge("expand_context", "generate")
    workflow.add_edge("rewrite_query", "retrieve")
    workflow.add_edge("generate", "output_safety")  # Output guardrail check
    workflow.add_edge("output_safety", END)

    return workflow.compile(checkpointer=checkpointer)


async def create_default_graph(checkpointer=None):
    """Create graph with default services — cached in builtins to survive module reloads.

    Langfuse tracing is handled at the chat route level: one trace per graph
    execution, with callbacks propagated via RunnableConfig to all nodes.

    Args:
        checkpointer: Optional checkpointer for state persistence.
                      Pass AsyncPostgresSaver for persistent chat history.
    """
    cached = getattr(_builtins, "_rag_cached_graph", None)
    if cached is not None:
        return cached

    settings = get_settings()
    embedding = EmbeddingService(settings)
    qdrant = await QdrantService.create(settings)
    reranker = RerankerService(settings)
    llm = create_llm(settings)
    graph = build_graph(embedding, qdrant, reranker, llm, checkpointer=checkpointer)

    _builtins._rag_cached_graph = graph
    return graph
