# Plan: Fix Blocking Call Issue in LangGraph Server

## Problem Summary
The LangGraph server is experiencing blocking call errors because synchronous socket operations (Qdrant client, HTTP requests) are running in an async ASGI context. This blocks the event loop and degrades performance for all concurrent requests.

Error: `qdrant_client.http.exceptions.ResponseHandlingException: Blocking call to socket.socket.connect`

## Root Cause Analysis
Three services are making synchronous blocking calls from async nodes:

1. **QdrantService** (`src/services/qdrant_client.py`)
   - Uses synchronous `QdrantClient`
   - Methods: `get_collections()`, `query_points()`, `scroll()`, `upsert()`, `delete()`
   - Called from `retrieve` node in async context

2. **EmbeddingService** (`src/services/embedding.py`)
   - Uses synchronous `httpx.post()`
   - Methods: `embed_documents()`, `embed_query()`
   - Called from `retrieve` node in async context

3. **RerankerService** (`src/services/reranker.py`)
   - Uses synchronous `httpx.post()`
   - Methods: `rerank()`
   - Called from `rerank` node in async context

## Solution: Convert to Async/Await Patterns

### Approach
Convert all blocking operations to async/await patterns for optimal performance in ASGI context. This is the recommended best practice for production deployments.

**Benefits:**
- ✅ Non-blocking event loop - better concurrency
- ✅ Proper async/await patterns - cleaner code
- ✅ Production-ready - recommended by LangGraph docs
- ✅ No workarounds needed

**Trade-offs:**
- Requires refactoring all service classes
- Node functions must become `async def`
- More comprehensive than quick fixes

## Implementation Steps

### Step 1: Convert QdrantService to Async
**File:** `src/services/qdrant_client.py`

**Changes:**
1. Import `AsyncQdrantClient` instead of `QdrantClient`:
   ```python
   from qdrant_client import AsyncQdrantClient, models
   ```

2. Convert `__init__` to async initialization pattern:
   ```python
   async def __init__(self, settings: Settings) -> None:
       self._client = AsyncQdrantClient(url=settings.qdrant_url)
       # ... store settings
       await self._ensure_collection()
   ```

3. Add factory method for async initialization:
   ```python
   @classmethod
   async def create(cls, settings: Settings) -> "QdrantService":
       service = cls.__new__(cls)
       service._client = AsyncQdrantClient(url=settings.qdrant_url)
       # ... initialize settings
       await service._ensure_collection()
       return service
   ```

4. Convert all methods to async:
   - `async def _ensure_collection(self) -> None:`
     - `await self._client.get_collections()`
     - `await self._client.create_collection()`
     - `await self._client.create_payload_index()`

   - `async def upsert(self, vectors, payloads) -> list[str]:`
     - `await self._client.upsert()`

   - `async def hybrid_search(self, ...) -> list[dict]:`
     - `await self._client.query_points()`
     - `await self._client.scroll()`

   - `async def dense_search(self, ...) -> list[dict]:`
     - `await self._client.query_points()`

   - `async def delete_by_document_id(self, document_id: str) -> None:`
     - `await self._client.delete()`

   - `async def health_check(self) -> bool:`
     - `await self._client.get_collections()`

   - `async def collection_info(self) -> dict:`
     - `await self._client.get_collection()`

5. Keep `_build_filter()` as synchronous static method (no I/O)

### Step 2: Convert EmbeddingService to Async
**File:** `src/services/embedding.py`

**Changes:**
1. Create async HTTP client:
   ```python
   import httpx

   class EmbeddingService:
       def __init__(self, settings: Settings) -> None:
           self._base_url = settings.model_server_url
           self._dim = settings.embedding_dim
           self._client = httpx.AsyncClient(timeout=120.0)

       async def close(self):
           await self._client.aclose()
   ```

2. Convert methods to async:
   - `async def embed_documents(self, texts: list[str]) -> list[list[float]]:`
     - `resp = await self._client.post()`

   - `async def embed_query(self, text: str) -> list[float]:`
     - `resp = await self._client.post()`

3. Add context manager support for proper cleanup:
   ```python
   async def __aenter__(self):
       return self

   async def __aexit__(self, exc_type, exc_val, exc_tb):
       await self.close()
   ```

### Step 3: Convert RerankerService to Async
**File:** `src/services/reranker.py`

**Changes:**
1. Create async HTTP client:
   ```python
   import httpx

   class RerankerService:
       def __init__(self, settings: Settings) -> None:
           self._base_url = settings.model_server_url
           self._top_k = settings.rerank_top_k
           self._client = httpx.AsyncClient(timeout=30.0)

       async def close(self):
           await self._client.aclose()
   ```

2. Convert methods to async:
   - `async def rerank(self, query, documents, top_k=None) -> list[RerankResult]:`
     - `resp = await self._client.post()`

3. Add context manager support:
   ```python
   async def __aenter__(self):
       return self

   async def __aexit__(self, exc_type, exc_val, exc_tb):
       await self.close()
   ```

### Step 4: Convert Node Functions to Async
**File:** `src/agent/nodes.py`

**Changes:**
1. Convert `make_retrieve_node`:
   ```python
   def make_retrieve_node(embedding: EmbeddingService, qdrant: QdrantService):
       async def retrieve(state: AgentState) -> dict:
           # ... existing code ...
           query_vector = await embedding.embed_query(query)  # await
           documents = await qdrant.hybrid_search(...)  # await
           # ... rest of logic ...
           return {...}
       return retrieve
   ```

2. Convert `make_rerank_node`:
   ```python
   def make_rerank_node(reranker: RerankerService):
       async def rerank(state: AgentState) -> dict:
           # ... existing code ...
           results = await reranker.rerank(query, documents)  # await
           # ... rest of logic ...
           return {...}
       return rerank
   ```

3. Convert `make_grade_documents_node`:
   ```python
   def make_grade_documents_node(llm: BaseChatModel):
       async def grade_documents(state: AgentState) -> dict:
           # ... existing code ...
           response = await llm.ainvoke(messages)  # await (LangChain async method)
           # ... rest of logic ...
           return {...}
       return grade_documents
   ```

4. Convert `make_generate_node`:
   ```python
   def make_generate_node(llm: BaseChatModel, model_name: str | None = None):
       async def generate(state: AgentState) -> dict:
           # ... existing code ...
           response = await llm.ainvoke(messages)  # await (LangChain async method)
           # ... rest of logic ...
           return {...}
       return generate
   ```

5. Convert `make_rewrite_query_node`:
   ```python
   def make_rewrite_query_node(llm: BaseChatModel):
       async def rewrite_query(state: AgentState) -> dict:
           # ... existing code ...
           response = await llm.ainvoke(messages)  # await
           # ... rest of logic ...
           return {...}
       return rewrite_query
   ```

6. Keep `should_retry` as synchronous (pure logic, no I/O)

### Step 5: Update Graph Initialization
**File:** `src/agent/graph.py`

**Changes:**
1. Convert `create_default_graph()` to async:
   ```python
   async def create_default_graph():
       """Create graph with default services - async initialization."""
       settings = get_settings()
       embedding = EmbeddingService(settings)
       qdrant = await QdrantService.create(settings)  # Use async factory
       reranker = RerankerService(settings)
       llm = create_llm(settings)
       return build_graph(embedding, qdrant, reranker, llm)
   ```

2. Update `langgraph.json` to handle async initialization:
   - LangGraph supports async graph factories
   - May need wrapper function if direct async not supported

3. Alternative: Use lazy initialization within first node
   - Store settings in graph state
   - Initialize services on first run
   - Cache initialized instances

### Step 6: Update LangGraph Configuration
**File:** `langgraph.json`

**No changes needed** - LangGraph automatically handles async nodes when graph is compiled.

### Step 7: Test All Changes

**Unit Tests:**
1. Test async QdrantService methods:
   - Collection creation/retrieval
   - Hybrid search
   - Dense search
   - Upsert/delete operations

2. Test async EmbeddingService methods:
   - Embed single query
   - Embed multiple documents

3. Test async RerankerService methods:
   - Rerank document list

**Integration Tests:**
1. Test full graph execution:
   - Single query flow
   - Multi-turn conversation
   - Query rewriting flow (with retries)

2. Test concurrent requests:
   - Run multiple queries simultaneously
   - Verify no blocking errors
   - Check performance improvements

**Manual Testing:**
1. Start LangGraph server: `docker compose up`
2. Send test query via WebSocket
3. Check logs for blocking call warnings (should be gone)
4. Test multi-turn conversation
5. Test with filters and runtime context

## Expected Outcomes

### Success Criteria
- ✅ No more "Blocking call to socket.socket.connect" errors
- ✅ All services use async/await patterns
- ✅ All nodes are async functions
- ✅ Existing functionality preserved (tests pass)
- ✅ Performance improved for concurrent requests
- ✅ Clean event loop usage

### Performance Improvements
- Better concurrency: multiple requests can run in parallel
- Lower latency: no event loop blocking
- Scalability: can handle more concurrent connections

### Code Quality
- Modern async/await patterns throughout
- Proper resource cleanup (async context managers)
- Production-ready ASGI compatibility
- Follows LangGraph best practices

## Rollback Plan
If issues arise during implementation:
1. Keep original files as `*.py.bak` before changes
2. Git branch for all changes: `fix/async-blocking-calls`
3. Can quickly revert via `git checkout main`
4. Alternative: Use quick fix `asyncio.to_thread()` temporarily
5. Override with `BG_JOB_ISOLATED_LOOPS=true` as last resort

## Files to Modify
1. `src/services/qdrant_client.py` - QdrantService async conversion
2. `src/services/embedding.py` - EmbeddingService async conversion
3. `src/services/reranker.py` - RerankerService async conversion
4. `src/agent/nodes.py` - All node functions to async
5. `src/agent/graph.py` - Async graph initialization
6. `tests/` - Update tests for async/await patterns

## Estimated Effort
- **Complexity:** Medium
- **Risk:** Low (well-established patterns, good test coverage)
- **Time:** ~2-3 hours for implementation + testing
- **Files changed:** 5 core files + test updates
