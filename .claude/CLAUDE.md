# CLAUDE.md — RAG Development Toolkit

This `.claude/` directory is a portable AI engineering toolkit for building production-grade RAG applications. Copy it to any project folder to get started.

## Quick Start
```bash
# Copy toolkit to new project
cp -r /path/to/.claude/ ./your-new-project/.claude/

# Available skills (type / in Claude Code)
/rag-init          # Scaffold complete RAG project from scratch
/api-gen           # Generate FastAPI endpoints
/langgraph-gen     # Generate LangGraph agent graphs
/vector-db         # Configure vector databases
/docker-gen        # Generate Docker Compose stack
/eval-pipeline     # Build RAG evaluation pipeline
/arch-review       # Review architecture decisions
/security-audit    # Run security audit
/rag-review        # Review RAG pipeline quality
/project-doc       # Generate documentation
/drawio-gen        # Create architecture diagrams
```

## Sub-Agents
- **rag-architect** — System design, tech stack selection, infrastructure planning
- **python-reviewer** — Code review for Python/FastAPI/LangGraph
- **security-auditor** — Security audit (OWASP LLM Top 10, containers, auth)
- **doc-writer** — Technical documentation generation

## RAG Tech Stack Reference

| Layer | Recommended | Alternatives |
|-------|------------|-------------|
| API | FastAPI (async, SSE) | Flask, gRPC |
| Orchestrator | LangGraph | LangChain, LlamaIndex, CrewAI |
| LLM (local) | Ollama, vLLM | TGI, llama.cpp, Triton |
| LLM (API) | Claude API, OpenAI | Gemini, Mistral, Groq |
| Embedding (local) | nomic-embed-text, e5-large | bge-m3, all-MiniLM |
| Embedding (API) | OpenAI ada-002/3-small | Cohere, Voyage |
| Reranker | jina-reranker, Cohere | ColBERT, bge-reranker |
| Vector DB | Qdrant | Pinecone, Weaviate, ChromaDB, pgvector |
| State DB | PostgreSQL | SQLite (dev only) |
| Auth DB | MongoDB / PostgreSQL | — |
| Cache | Redis | Memcached |
| Storage | MinIO (S3) | Local filesystem |
| Observability | Langfuse | LangSmith, Phoenix |
| Monitoring | Prometheus + Grafana | Datadog, New Relic |
| Containers | Docker Compose | Kubernetes, Podman |

## Development Standards
- Python 3.12+ with full type annotations
- Pydantic v2 for all data models
- Async everywhere (asyncpg, Motor, aiohttp, aioredis)
- LangGraph StateGraph for agent orchestration (not chains)
- Hybrid search (dense + sparse with RRF) — never single-mode
- All LLM calls through Langfuse for observability
- Guardrails (input_safety + output_safety) mandatory in every agent
- Docker health checks on every service
- No hardcoded secrets — environment variables only
- Structured JSON logging with correlation IDs
- pytest for all tests, testcontainers for integration tests
