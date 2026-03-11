---
name: langgraph-gen
description: Generate LangGraph agent graphs for RAG applications. Creates state schemas, node functions, conditional edges, checkpointing, human-in-the-loop, and streaming support.
disable-model-invocation: true
---

# LangGraph Agent Generator

## What to generate
$ARGUMENTS

## LangGraph Patterns

### State Schema
```python
from typing import Annotated, TypedDict
from langgraph.graph.message import add_messages

class AgentState(TypedDict):
    messages: Annotated[list, add_messages]
    query: str
    documents: list[Document]
    generation: str
    retry_count: int
    relevance_score: float
    safety_passed: bool
```

### Graph Construction
```python
from langgraph.graph import StateGraph, START, END

workflow = StateGraph(AgentState)

# Add nodes
workflow.add_node("input_safety", input_safety_node)
workflow.add_node("router", router_node)
workflow.add_node("retrieve", retrieve_node)
workflow.add_node("rerank", rerank_node)
workflow.add_node("grade", grade_node)
workflow.add_node("rewrite", rewrite_query_node)
workflow.add_node("generate", generate_node)
workflow.add_node("output_safety", output_safety_node)

# Add edges
workflow.add_edge(START, "input_safety")
workflow.add_conditional_edges("input_safety", check_safety, {
    "safe": "router",
    "unsafe": END
})
workflow.add_conditional_edges("router", route_intent, {
    "search": "retrieve",
    "greeting": "generate",
    "off_topic": END
})
workflow.add_edge("retrieve", "rerank")
workflow.add_edge("rerank", "grade")
workflow.add_conditional_edges("grade", check_relevance, {
    "relevant": "generate",
    "not_relevant": "rewrite",
    "give_up": END  # after max retries
})
workflow.add_edge("rewrite", "retrieve")  # cycle back
workflow.add_edge("generate", "output_safety")
workflow.add_edge("output_safety", END)

graph = workflow.compile(checkpointer=checkpointer)
```

### Node Function Pattern
```python
from langchain_core.messages import AIMessage

async def retrieve_node(state: AgentState) -> dict:
    """Retrieve relevant documents from vector store."""
    query = state["query"]

    # Hybrid search
    results = await vector_store.search(
        query=query,
        limit=20,
        search_type="hybrid"  # dense + sparse
    )

    return {"documents": results}
```

### Conditional Edge Pattern
```python
def check_relevance(state: AgentState) -> str:
    """Route based on document relevance score."""
    if state["relevance_score"] >= 0.7:
        return "relevant"
    if state["retry_count"] >= 3:
        return "give_up"
    return "not_relevant"
```

### Checkpointing (Persistence)
```python
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

async with AsyncPostgresSaver.from_conn_string(DATABASE_URL) as checkpointer:
    await checkpointer.setup()
    graph = workflow.compile(checkpointer=checkpointer)

    # Invoke with thread_id for persistence
    config = {"configurable": {"thread_id": session_id}}
    result = await graph.ainvoke(input, config)
```

### Human-in-the-Loop
```python
graph = workflow.compile(
    checkpointer=checkpointer,
    interrupt_before=["generate"]  # pause before generation
)

# Resume after human approval
await graph.ainvoke(None, config)  # continues from checkpoint
```

### Streaming
```python
async for event in graph.astream_events(input, config, version="v2"):
    kind = event["event"]
    if kind == "on_chat_model_stream":
        token = event["data"]["chunk"].content
        yield token
    elif kind == "on_chain_end":
        node_name = event["name"]
        # Track node completion
```

### Subgraph Composition
```python
# Create a subgraph for document processing
doc_processor = StateGraph(DocState)
doc_processor.add_node("parse", parse_node)
doc_processor.add_node("chunk", chunk_node)
doc_processor.add_node("embed", embed_node)
doc_subgraph = doc_processor.compile()

# Use in main graph
main_graph.add_node("process_docs", doc_subgraph)
```

## Common Agent Patterns

### 1. Basic RAG Agent
`input_safety → retrieve → rerank → generate → output_safety`

### 2. Adaptive RAG Agent (with retry)
`input_safety → router → retrieve → rerank → grade → [generate | rewrite→retrieve] → output_safety`

### 3. Multi-Agent System
`supervisor → [researcher, writer, critic] → synthesizer`

### 4. Tool-Using Agent
`planner → [search_tool, calculator, code_exec] → synthesizer → validator`

### 5. Document Processing Agent
`upload → detect_type → parse → chunk → embed → index → verify`

## Code Quality
- Every node is a pure async function
- State mutations return only changed keys
- All LLM calls wrapped with Langfuse observability
- Error handling in every node (never crash the graph)
- Timeout on external calls (LLM, vector DB, reranker)
- Logging at node entry/exit with state summary
