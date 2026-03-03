import uuid

from fastapi import APIRouter, Depends, HTTPException

from src.api.auth_dependencies import get_current_user
from src.models.schemas import QueryRequest, QueryResponse, SourceDocument
from src.services.graph_runner import get_graph

router = APIRouter(tags=["query"])


@router.post("/query", response_model=QueryResponse)
async def query(request: QueryRequest, _user: dict = Depends(get_current_user)):
    graph = get_graph()

    try:
        # Use a unique thread_id for one-shot queries (no session persistence needed)
        config = {"configurable": {"thread_id": str(uuid.uuid4())}}

        # Run the graph and collect final state
        result = {}
        async for event in graph.astream(
            {
                "messages": [],
                "query": request.query,
                "documents": [],
                "generation": "",
                "retries": 0,
                "filters": request.filters,
                "context_metadata": None,
                "runtime_context": None,
                "needs_clarification": False,
                "clarification_question": None,
                "human_response": None,
                "guardrail_blocked": False,
            },
            config=config,
            stream_mode="updates",
        ):
            result.update(event)

        # Get final state from checkpointer
        state = await graph.aget_state(config)
        values = state.values if state else {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Graph execution error: {e}")

    sources = []
    for doc in values.get("documents", []):
        meta = doc.get("metadata", {})
        sources.append(
            SourceDocument(
                text=doc["text"][:500],
                score=doc.get("score"),
                page_number=meta.get("page_number"),
                source=meta.get("source"),
                language=meta.get("language"),
            )
        )

    return QueryResponse(
        answer=values.get("generation", "No answer generated."),
        sources=sources,
        query=values.get("query", request.query),
        retries=values.get("retries", 0),
    )
