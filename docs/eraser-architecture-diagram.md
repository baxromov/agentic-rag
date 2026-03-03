# Eraser.io — Architecture Diagram Prompt

> Copy the code block below and paste it into [eraser.io](https://app.eraser.io/) diagram editor.

```
// Agentic RAG Platform — Architecture Diagram

// ===== User Layer =====
User [icon: user]

// ===== Docker Network: rag-network =====

// --- Frontend ---
Frontend [icon: react, label: "Frontend\nReact 19 + Vite 7\n:5173"] {
  SPA [icon: browser, label: "SPA\nTypeScript + Tailwind v4"]
}

// --- API Layer ---
FastAPI Backend [icon: python, label: "FastAPI Backend\nPython 3.12\n:8000"] {
  REST API [icon: api, label: "REST API\nAuth, Documents, Chat"]
  SSE Streaming [icon: stream, label: "SSE Streaming\nChat responses"]
  LangGraph Agent [icon: brain, label: "LangGraph Agent\nRAG pipeline"]
  Document Ingestion [icon: file, label: "Document Ingestion\nParse, Chunk, Embed"]
}

LangGraph Server [icon: server, label: "LangGraph Server\nLangGraph Platform\n:8123"] {
  Input Safety [icon: shield, label: "Input Safety\nLLM Guardrail"]
  Intent Router [icon: signpost, label: "Intent Router\nPattern + LLM"]
  Greeting Node [icon: hand, label: "Greeting Response\nTemplate (uz/ru/en)"]
  General Node [icon: chat, label: "General Response\nDirect LLM"]
  Query Prepare [icon: edit, label: "Query Prepare\nRewrite + Multi-query"]
  Retrieve Node [icon: search, label: "Retrieve\nHybrid search (RRF)"]
  Rerank Node [icon: sort, label: "Rerank\nCross-encoder"]
  Grade Documents [icon: check, label: "Grade Documents\nScore threshold"]
  Human Feedback [icon: user-check, label: "Human Feedback\ninterrupt() — HITL"]
  Expand Context [icon: expand, label: "Expand Context\nParent + neighbor"]
  Generate Node [icon: brain, label: "Generate\nLLM + context budget"]
  Rewrite Query [icon: refresh, label: "Rewrite Query\nLLM reformulation"]
  Output Safety [icon: shield, label: "Output Safety\nLLM Guardrail"]
}

// --- AI / ML Layer ---
Model Server [icon: cpu, label: "Model Server\nReranker (FastEmbed)\nCPU only\n:8080"] {
  Jina Reranker [icon: ai, label: "jina-reranker-v2\nmultilingual"]
}

Ollama [icon: gpu, label: "Ollama\nHost Machine\n:11434"] {
  LLM Model [icon: brain, label: "LLM\nllama3.1 / gpt-oss-120b"]
  Embedding Model [icon: database, label: "Embedding\nnomic-embed-text\n768-dim"]
}

// --- Data Layer ---
Qdrant [icon: search, label: "Qdrant\nVector DB\n:6333 / :6334"] {
  Dense Vectors [icon: grid, label: "Dense Vectors\n768-dim"]
  Full Text Index [icon: text, label: "Full-Text Index"]
}

PostgreSQL [icon: postgres, label: "PostgreSQL 16\n:5432"] {
  LangGraph DB [icon: database, label: "langgraph DB\nAgent checkpoints"]
}

MongoDB [icon: mongodb, label: "MongoDB 7\n:27017"] {
  Users Collection [icon: users, label: "users\nCredentials, roles"]
  Sessions Collection [icon: chat, label: "chat_sessions\nChat metadata"]
  Feedback Collection [icon: thumbsup, label: "message_feedback\nThumbs up/down"]
}

Redis [icon: redis, label: "Redis 7\n:6379"] {
  PubSub [icon: broadcast, label: "Pub/Sub\nLangGraph coordination"]
  Cache [icon: cache, label: "Cache\nLangfuse queue"]
}

MinIO [icon: aws-s3, label: "MinIO\nS3-compatible\n:9000 / :9001"] {
  Documents Bucket [icon: folder, label: "documents\nUploaded files"]
  Langfuse Bucket [icon: folder, label: "langfuse\nEvents & media"]
}

// --- Observability Layer (optional) ---
Langfuse [icon: monitor, label: "Langfuse v3\nLLM Observability\n:3000"] {
  Langfuse Web [icon: browser, label: "Web UI"]
  Langfuse Worker [icon: worker, label: "Background Worker"]
}

Langfuse PostgreSQL [icon: postgres, label: "Langfuse PG\n:5433"] {
  Langfuse DB [icon: database, label: "langfuse DB"]
}

ClickHouse [icon: database, label: "ClickHouse\nOLAP Analytics"]

// ===== Connections =====

// User access
User --> Frontend: HTTPS :5173
User --> FastAPI Backend: HTTPS :8000 [style: dashed]

// Frontend to API
Frontend --> FastAPI Backend: HTTP API + SSE

// FastAPI to AI/ML
FastAPI Backend --> Ollama: HTTP :11434\nLLM + Embeddings
FastAPI Backend --> Model Server: HTTP :8080\nReranker

// FastAPI to Data
FastAPI Backend --> Qdrant: HTTP :6333\nHybrid search (RRF)
FastAPI Backend --> PostgreSQL: TCP :5432\nCheckpoints
FastAPI Backend --> MongoDB: TCP :27017\nUsers, Sessions
FastAPI Backend --> Redis: TCP :6379\nPub/Sub
FastAPI Backend --> MinIO: HTTP :9000\nDocument files

// FastAPI to other services
FastAPI Backend --> LangGraph Server: HTTP :8000\nSession management
FastAPI Backend --> Langfuse: HTTP :3000\nTraces [style: dashed]

// LangGraph Server connections
LangGraph Server --> Qdrant: HTTP
LangGraph Server --> PostgreSQL: TCP
LangGraph Server --> Redis: TCP
LangGraph Server --> Model Server: HTTP
LangGraph Server --> Ollama: HTTP
LangGraph Server --> MinIO: HTTP

// Langfuse connections
Langfuse --> Langfuse PostgreSQL: TCP :5432
Langfuse --> ClickHouse: HTTP :8123
Langfuse --> Redis: TCP :6379
Langfuse --> MinIO: HTTP :9000
```
