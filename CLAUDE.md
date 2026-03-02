# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Agentic RAG (Retrieval-Augmented Generation) framework for Ipoteka Bank. Document upload, chunking, hybrid vector search, and AI-powered Q&A over internal documents. Supports Uzbek, Russian, and English.

## Architecture

- **Backend**: Python 3.12, FastAPI, LangGraph agent with self-correcting retrieval loop
- **Frontend**: React 19 + TypeScript 5.9 + Tailwind CSS v4 + Vite 7 (hardcoded dark theme)
- **Vector DB**: Qdrant (hybrid search: dense vectors + full-text via RRF fusion)
- **Storage**: MinIO (S3-compatible) for document files
- **Embeddings**: Ollama nomic-embed-text (768-dim), batched via httpx
- **Reranker**: jinaai/jina-reranker-v2-base-multilingual via model-server (FastEmbed)
- **LLM**: Multi-provider (Claude, OpenAI, Ollama) — configured via `LLM_PROVIDER` in `.env`
- **State**: LangGraph with PostgreSQL persistence + Redis pub/sub

## Running

```bash
docker compose up              # all 7 services (minio, qdrant, redis, postgres, model-server, fastapi, langgraph-server, frontend)
docker compose up -d           # detached
docker compose build fastapi langgraph-server  # rebuild after Python code changes
docker compose up -d fastapi langgraph-server  # restart after rebuild
docker compose logs fastapi --tail=50          # view backend logs
```

Frontend has volume mount — changes are hot-reloaded. Backend code is baked into Docker image — requires `docker compose build` then `up -d`.

## Testing

```bash
docker compose exec -T fastapi python -m pytest tests/                    # all tests
docker compose exec -T fastapi python -m pytest tests/test_agent/         # agent tests only
docker compose exec -T fastapi python -m pytest tests/test_services/ -k "test_embedding"  # single test
```

pytest-asyncio with `asyncio_mode: auto` — all tests run async by default.

## Frontend Commands

```bash
cd frontend
npm run dev       # local dev server (port 5173)
npm run build     # tsc -b && vite build
npm run lint      # eslint
```

## Key URLs

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs
- LangGraph: http://localhost:8123
- MinIO Console: http://localhost:9001
- Qdrant Dashboard: http://localhost:6333/dashboard

## Project Structure

```
src/
  agent/          # LangGraph agent: graph.py (StateGraph builder), nodes.py (5 node implementations), guardrails.py, prompts.py, prompt_factory.py
  api/            # FastAPI: app.py (factory), auth_dependencies.py, routes/ (chat, documents, health, query, sessions, feedback, auth, admin)
  config/         # settings.py (pydantic-settings, reads .env, @lru_cache singleton)
  ingestion/      # pipeline.py (upload→parse→chunk→embed→upsert), parser.py (unstructured), chunker.py
  services/       # llm.py, embedding.py, qdrant_client.py, minio_client.py, reranker.py, context_manager.py, mongodb.py, auth.py
  models/         # state.py (AgentState TypedDict w/ HITL fields), schemas.py (Pydantic models), auth.py
model_server/     # Separate reranker HTTP server (FastEmbed-based)
frontend/src/
  components/     # chat/, knowledge/, dashboard/, analytics/, settings/, common/, layout/
  store/          # appStore.ts (Zustand), uploadStore.ts (upload queue), sessionStore.ts (chat sessions), authStore.ts (JWT auth)
  hooks/          # useStreamingChat.ts (SSE + sessions + HITL + feedback), useWebSocket.ts
  config/         # api.ts (dynamic hostname detection), apiClient.ts (JWT fetch wrapper with auto-refresh)
  types/          # api.ts, message.ts, settings.ts, session.ts (ChatSession, MessageFeedback), auth.ts
```

## Agent Flow

```
intent_router ─┬→ greeting_response → END
               └→ query_prepare → retrieve → rerank → grade_documents → human_feedback
                   ─┬→ expand_context → generate → END
                    └→ rewrite_query → retrieve (max 3 retries)
```

- **intent_router**: Pattern-based classification (greeting/thanks/hr_query) — no LLM
- **greeting_response**: Multilingual greeting (uz/ru/en) — no LLM
- **query_prepare**: Rewrites query + multi-query + step-back + filters in ONE LLM call
- **retrieve**: Hybrid search (dense + full-text) with RRF fusion, 10% language boost for same-language docs
- **rerank**: Cross-encoder via model-server HTTP call
- **grade_documents**: Reranker score threshold filter — triggers HITL if all scores < 0.25 after retry
- **human_feedback**: LangGraph `interrupt()` — pauses graph for user clarification when triggered
- **expand_context**: Parent/neighbor chunk expansion
- **generate**: Response with context budget management
- **rewrite_query**: LLM reformulates query on grading failure

## Data Flow

### Chat: `POST /chat/stream` → SSE
1. Input validation (guardrails: injection detection, PII masking, length limits)
2. Session resolution: use existing `session_id` or create new thread with user metadata
3. LangGraph graph execution (intent → retrieve → rerank → grade → human_feedback → generate/rewrite loop)
4. SSE events: `session_created`, `session_title`, `node_end` (per node), `clarification_needed` (HITL), `generation` (final answer + sources)
5. Auto-title generation on first exchange via LLM

### Chat Resume: `POST /chat/resume` → SSE
- Resumes an interrupted graph after HITL clarification using `Command(resume=response)`

### Sessions API (via LangGraph Server)
- `GET /sessions` — list user's sessions (filtered by `user_id` in thread metadata)
- `POST /sessions` — create new session
- `GET /sessions/{id}/messages` — load messages from thread state
- `PATCH /sessions/{id}` — update title
- `DELETE /sessions/{id}` — delete session
- All endpoints verify `thread.metadata.user_id == current_user_id`

### Feedback API (via MongoDB)
- `POST /feedback` — submit thumbs up/down (note required for down)
- `GET /feedback/{thread_id}` — get feedback for a session

### Document Upload: `POST /documents/upload` → multipart
1. Parse (unstructured library with Tesseract OCR)
2. Chunk (RecursiveCharacterTextSplitter, 1000/200)
3. Language detect (LLM-based, batch: en/ru/uz)
4. Embed (Ollama nomic-embed-text)
5. Upsert to Qdrant with metadata (document_id, file_hash SHA256, page_number, language, chunk_index)

## Important Patterns

### Corporate SSL Bypass (critical — 5 locations)
The network has SSL inspection. All external HTTPS calls need `verify=False`:
- `src/services/llm.py`: Patches `ChatAnthropic._async_client` with `httpx.AsyncClient(verify=False)`
- `Dockerfile.langgraph`: `sitecustomize.py` patches httpx globally
- `docker-compose.yml`: `PYTHONHTTPSVERIFY=0` env var on fastapi + langgraph-server
- Frontend/model-server: `NODE_TLS_REJECT_UNAUTHORIZED=0`, `SSL_VERIFY_DISABLE=1`

Any new service making external HTTPS calls must also disable SSL verification.

### Service Initialization
- **Sync services**: `@lru_cache` dependency injection (`get_settings()`)
- **Async services**: Factory classmethod `create()` then singleton (QdrantService needs async init)
- **LLM factory**: `src/services/llm.py` — `get_llm()` returns ChatAnthropic/ChatOpenAI/ChatOllama based on `LLM_PROVIDER`

### Ollama Connectivity
Docker containers reach host Ollama via `host.docker.internal:11434`. Requires Docker Desktop or explicit network config.

### Dark Theme (hardcoded)
Frontend uses hardcoded dark slate palette — no `dark:` variants. Tailwind v4's dynamic dark mode was unreliable.
- Page: `bg-slate-950`, Cards: `bg-slate-900`, Inputs: `bg-slate-800`
- Text hierarchy: `text-slate-100` → `text-slate-200` → `text-slate-400` → `text-slate-500`

### Tailwind v4
Uses `@import "tailwindcss"` in index.css (not v3 `@tailwind` directives). CSS variables for theming.

### Upload Queue
`uploadStore.ts` manages serialized (one-by-one) background uploads. Persists to localStorage. Auto-resumes on page refresh. Toast notifications via `UploadToast.tsx` in `App.tsx`.

### Hybrid Search
Qdrant uses RRF (Reciprocal Rank Fusion, k=60) to combine dense + full-text results. If text index is missing on collection, search silently falls back to dense only.

### Chat Sessions
Session management uses **LangGraph Server API** (`langgraph-sdk`) — no direct PostgreSQL access. Thread metadata stores `user_id`, `title`, `message_count`. Frontend `sessionStore.ts` (Zustand) tracks sessions list and `activeSessionId` (persisted to localStorage). Sidebar shows session list only on `/chat` route.

### Human-in-the-Loop (HITL)
When `grade_documents` detects all documents score < 0.25 after at least 1 retry, it sets `needs_clarification=True` with a multilingual question. The `human_feedback` node uses `langgraph.types.interrupt()` to pause the graph. Frontend shows `ClarificationPrompt` component. User response resumes via `POST /chat/resume` with `Command(resume=response)`.

### Message Feedback
Thumbs up/down stored in MongoDB `message_feedback` collection (indexed on `thread_id + message_index`). Frontend `MessageFeedback` component below each assistant message. Note required for thumbs down.

### Authentication
JWT-based auth with access + refresh tokens. `apiClient.ts` auto-attaches Bearer token and handles 401 with transparent refresh. MongoDB stores users. Admin seeded on startup via `lifespan`.

## Config (.env)

Key variables (see `src/config/settings.py` for all defaults):
- `LLM_PROVIDER`: `claude`, `openai`, or `ollama` (default: `ollama`)
- `ANTHROPIC_API_KEY` / `CLAUDE_MODEL` (default: `claude-sonnet-4-20250514`)
- `OLLAMA_BASE_URL` / `OLLAMA_MODEL` (default: `llama3.1`)
- `EMBEDDING_MODEL`: `nomic-embed-text:latest`, `EMBEDDING_DIM`: `768`
- `CHUNK_SIZE=1000`, `CHUNK_OVERLAP=200`
- `RETRIEVAL_TOP_K=10`, `RERANK_TOP_K=5`, `RRF_K=60`

## Common Tasks

- **Switch LLM**: Edit `.env` (`LLM_PROVIDER`, model name), then `docker compose build fastapi langgraph-server && docker compose up -d fastapi langgraph-server`
- **Check health**: `curl http://localhost:8000/health`
- **View logs**: `docker compose logs fastapi --tail=50` or `langgraph-server`
- **Rebuild after Python changes**: `docker compose build fastapi langgraph-server && docker compose up -d`
