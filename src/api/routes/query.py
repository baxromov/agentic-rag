from fastapi import APIRouter, HTTPException
from langgraph_sdk import get_client

from src.config.settings import get_settings
from src.models.schemas import QueryRequest, QueryResponse, SourceDocument

router = APIRouter(tags=["query"])


@router.post("/query", response_model=QueryResponse)
async def query(request: QueryRequest):
    settings = get_settings()
    client = get_client(url=settings.langgraph_api_url)

    try:
        # Create a thread
        thread = await client.threads.create()

        # Run the graph
        result = await client.runs.wait(
            thread_id=thread["thread_id"],
            assistant_id="rag_agent",
            input={
                "messages": [],
                "query": request.query,
                "documents": [],
                "generation": "",
                "retries": 0,
                "filters": request.filters,
            },
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LangGraph API error: {e}")

    sources = []
    for doc in result.get("documents", []):
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
        answer=result.get("generation", "No answer generated."),
        sources=sources,
        query=result.get("query", request.query),
        retries=result.get("retries", 0),
    )
