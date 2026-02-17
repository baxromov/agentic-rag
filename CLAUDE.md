# CLAUDE.md

## Project Overview

Agentic RAG (Retrieval-Augmented Generation) framework for Ipoteka Bank. Provides document upload, chunking, vector search, and AI-powered Q&A over internal documents. Supports Uzbek, Russian, and English.

## Architecture

- **Backend**: Python 3.12, FastAPI, LangGraph agent with self-correcting retrieval loop
- **Frontend**: React 18 + TypeScript + Tailwind CSS v4 + Vite 7 (hardcoded dark theme)
- **Vector DB**: Qdrant (hybrid search: dense vectors + full-text)
- **Storage**: MinIO (S3-compatible) for document files
- **Embeddings**: sentence-transformers via custom model-server
- **LLM**: Multi-provider (Claude, OpenAI, Ollama) — configured via `LLM_PROVIDER` in `.env`
- **State**: LangGraph with PostgreSQL persistence + Redis pub/sub

## Running

```bash
docker compose up          # all services
docker compose up -d       # detached
docker compose restart fastapi langgraph-server  # after code changes (need rebuild if no volume mount)
docker compose build fastapi langgraph-server    # rebuild after Python code changes
```

Frontend has volume mount — changes are hot-reloaded. Backend code is baked into Docker image — requires `docker compose build` then `up -d`.

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
  agent/          # LangGraph agent: graph.py (flow), nodes.py (retrieve/rerank/grade/generate), guardrails.py, prompts.py
  api/            # FastAPI app: routes/ (chat, documents, health, query)
  config/         # settings.py (pydantic-settings, reads .env)
  ingestion/      # pipeline.py (upload->parse->chunk->embed->upsert), parser.py, chunker.py
  services/       # llm.py, embedding.py, qdrant_client.py, minio_client.py, reranker.py
  models/         # state.py (AgentState), schemas.py
model_server/     # Separate embedding + reranker HTTP server
frontend/src/
  components/     # chat/, knowledge/, dashboard/, analytics/, settings/, common/, layout/
  store/          # appStore.ts (Zustand), uploadStore.ts (upload queue)
  hooks/          # useStreamingChat.ts, useWebSocket.ts
  types/          # api.ts, message.ts, settings.ts
```

## Agent Flow

`retrieve` -> `rerank` -> `grade_documents` -> `generate` (or `rewrite_query` -> retry, max 3)

## Important Patterns

- **Corporate SSL**: The network has SSL inspection. All external HTTPS calls need `verify=False`. This is handled in:
  - `src/services/llm.py`: Patches `ChatAnthropic._async_client` with `httpx.AsyncClient(verify=False)`
  - `Dockerfile.langgraph`: `sitecustomize.py` patches httpx globally
  - `docker-compose.yml`: `PYTHONHTTPSVERIFY=0` env var on fastapi + langgraph-server
  - Frontend/model-server: `NODE_TLS_REJECT_UNAUTHORIZED=0`, `SSL_VERIFY_DISABLE=1`
- **Dark theme**: Frontend uses hardcoded dark slate palette (no `dark:` variants). Colors: `bg-slate-950` (page), `bg-slate-900` (cards), `bg-slate-800` (inputs), `text-slate-100/200/400/500` hierarchy.
- **Upload queue**: `uploadStore.ts` manages background file uploads. Files uploaded one-by-one to `POST /documents/upload`. Toast notifications via `UploadToast.tsx` mounted in `App.tsx`.
- **Tailwind v4**: Uses `@import "tailwindcss"` in index.css (not v3 `@tailwind` directives). CSS variables for colors. `dark:` variants didn't work reliably — that's why we use hardcoded dark colors.

## Config (.env)

Key variables:
- `LLM_PROVIDER`: `claude`, `openai`, or `ollama`
- `ANTHROPIC_API_KEY` / `CLAUDE_MODEL`: For Claude provider
- `OLLAMA_BASE_URL` / `OLLAMA_MODEL`: For Ollama provider
- `EMBEDDING_MODEL` / `EMBEDDING_DIM`: Embedding config (384 dim with all-MiniLM-L6-v2)
- `CHUNK_SIZE=1000`, `CHUNK_OVERLAP=200`

## Testing

```bash
docker compose exec -T fastapi python -m pytest tests/
```

## Common Tasks

- **Switch LLM**: Edit `.env` (`LLM_PROVIDER`, model name), then `docker compose build fastapi langgraph-server && docker compose up -d fastapi langgraph-server`
- **Upload documents**: Use Knowledge Base page UI (supports files + folders)
- **Check health**: `curl http://localhost:8000/health`
- **View logs**: `docker compose logs fastapi --tail=50` or `langgraph-server`
