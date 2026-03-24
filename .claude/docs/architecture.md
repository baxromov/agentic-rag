# Agentic RAG — System Architecture (Ipoteka Bank HR Assistant)

> Auto-generated from codebase. Updated: 2026-03-17

---

## 1. Service Topology (Docker Compose)

```mermaid
graph TD
    subgraph CLIENT["CLIENT LAYER"]
        Browser["🌐 Browser"]
    end

    subgraph FRONTEND["FRONTEND  :5173"]
        FE["React 19 + TypeScript 5.9\nTailwind v4 + Vite 7\nZustand (appStore, uploadStore,\nsessionStore, authStore)\nSSE consumer + JWT auto-refresh"]
    end

    subgraph BACKEND["BACKEND  :8000"]
        API["FastAPI (Python 3.12)\nRoutes: auth, admin, chat,\ndocuments, sessions, feedback,\nquery, health\nMiddleware: CORS, SPA fallback"]
        LG["LangGraph Server\n:8123 → internal :8000\nDirect graph invocation\nAsyncMongoDBSaver checkpointer"]
    end

    subgraph AI["AI / MODEL LAYER"]
        MS["Model Server\n:8080\njina-reranker-v1-tiny-en\nQdrant/bm25 (sparse embed)\nFastEmbed"]
        OLLAMA["Ollama (host)\n:11434\nnomic-embed-text-v2-moe\n768-dim dense embeddings\nllama3.1 (default LLM)"]
        LLM_EXT["External LLM\nClaude claude-sonnet-4-20250514\nOpenAI gpt-4o\n(via HTTPS, SSL bypassed)"]
        LANGFUSE["Langfuse\n:3000\nObservability / Tracing\n(disabled in compose)"]
    end

    subgraph DATA["DATA LAYER"]
        MONGO["MongoDB 7\n:27017\nchat_sessions\nmessage_feedback\nusers\nlanggraph checkpoints"]
        QDRANT["Qdrant\n:6333 HTTP\n:6334 gRPC\ncollection: documents\nhybrid: dense(768) + sparse BM25\nRRF fusion k=40"]
        REDIS["Redis 7-alpine\n:6379\nPub/Sub (LangGraph)\nSession cache"]
        MINIO["MinIO\n:9000 API\n:9001 Console\nS3-compatible\nOriginal document files\nbucket: documents"]
    end

    Browser -->|"HTTP/SSE"| FE
    FE -->|"REST + SSE\nBearer JWT"| API
    API -->|"graph.ainvoke()\nAsyncMongoDBSaver"| LG
    API -->|"POST /rerank\nPOST /sparse-embed"| MS
    API -->|"POST /api/embed\n768-dim"| OLLAMA
    API -->|"HTTPS (verify=False)\nClaude/OpenAI API"| LLM_EXT
    API -->|"CRUD sessions\nfeedback, users\ncheckpoints"| MONGO
    API -->|"hybrid search\nupsert vectors"| QDRANT
    API -->|"store/get files\nSHA256 dedup"| MINIO
    LG -->|"Redis pub/sub"| REDIS
    LG -->|"checkpoint R/W"| MONGO
    API -.->|"traces (optional)"| LANGFUSE

    style CLIENT fill:#1e293b,stroke:#475569,color:#f1f5f9
    style FRONTEND fill:#1e3a2f,stroke:#22c55e,color:#f1f5f9
    style BACKEND fill:#1e2a3a,stroke:#3b82f6,color:#f1f5f9
    style AI fill:#2a1e3a,stroke:#a855f7,color:#f1f5f9
    style DATA fill:#2a2a1e,stroke:#eab308,color:#f1f5f9
```

---

## 2. LangGraph Agent Flow (Full State Machine)

```mermaid
flowchart TD
    START(["▶ START\nuser query + thread_id"])

    subgraph GUARD_IN["INPUT GUARDRAIL"]
        IS["input_safety\nLLM structured output\nInputSafetyResult\nDetects: identity probe,\njailbreak, injection,\nmanipulation"]
    end

    subgraph ROUTING["INTENT ROUTING"]
        IR{"intent_router\nFast path: regex patterns\ngreeting / thanks\nSlow path: LLM classify\nhr_query vs general_query"}
        GR["greeting_response\nNo LLM — static\nMultilingual uz/ru/en"]
        GenR["general_response\nDirect LLM answer\nNo RAG retrieval"]
    end

    subgraph RAG["RAG PIPELINE"]
        QP["query_prepare\n1x LLM call\n• Rewrite query\n• Multi-query ×3\n• Step-back query\n• Infer metadata filters\nOutputs JSON"]
        RET["retrieve\nHybrid search:\n• Dense (768-dim nomic)\n• Sparse (BM25)\nRRF fusion k=40\ntop_k=15, prefetch=30\n+10% same-language boost"]
        RNK["rerank\nCross-encoder HTTP\njina-reranker-v1-tiny-en\nmodel-server :8080\ntop_k=7, timeout=30s"]
        GD{"grade_documents\nNO LLM — threshold\nscore ≥ 0.15 → keep\nalways keep top 3\nmax_score < 0.25\nAND retries ≥ 1\n→ HITL trigger"}
        HF["human_feedback\nLangGraph interrupt()\nMultilingual clarification\nPauses graph state\nAwaits POST /chat/resume"]
        RW["rewrite_query\nLLM reformulation\nretries++ (max 3)"]
        EC["expand_context\nParent chunk lookup\nNeighbor window=1\nDeduplication"]
        GEN["generate\nLLM + dynamic prompt\nContext budget mgmt:\n• Claude: 200k − 4k\n• GPT-4o: 128k − 4k\n• Ollama: 128k − 4k\nConversation history\nCitations + confidence"]
    end

    subgraph GUARD_OUT["OUTPUT GUARDRAIL"]
        OS{"output_safety\nLLM structured output\nOutputSafetyResult\nDetects: identity leak,\nprovider mention,\noff-character response"}
    end

    END_SAFE(["⛔ END\nCanned safe response\nmultilingual"])
    END_GREET(["✅ END\nGreeting / Thanks"])
    END_GEN(["✅ END\nAnswer + Sources\nSSE: generation event"])

    START --> IS
    IS -->|"blocked"| END_SAFE
    IS -->|"safe"| IR

    IR -->|"greeting / thanks"| GR
    IR -->|"general_query"| GenR
    IR -->|"hr_query"| QP

    GR --> END_GREET
    GenR --> OS

    QP --> RET
    RET --> RNK
    RNK --> GD

    GD -->|"score ≥ 0.25\nor retries < 1"| EC
    GD -->|"HITL trigger"| HF
    GD -->|"fail retries < 3"| RW

    HF -->|"resume: clarification\nresets docs + retries"| RET
    RW -->|"retry loop"| RET

    EC --> GEN
    GEN --> OS

    OS -->|"safe"| END_GEN
    OS -->|"blocked → fallback"| END_GEN

    style IS fill:#4a1e1e,stroke:#ef4444,color:#fef2f2
    style OS fill:#4a1e1e,stroke:#ef4444,color:#fef2f2
    style IR fill:#3a3a1e,stroke:#eab308,color:#fefce8
    style GD fill:#3a3a1e,stroke:#eab308,color:#fefce8
    style HF fill:#2a1e4a,stroke:#a855f7,color:#faf5ff
    style RET fill:#1e2a4a,stroke:#3b82f6,color:#eff6ff
    style RNK fill:#1e2a4a,stroke:#3b82f6,color:#eff6ff
    style GEN fill:#1e3a2f,stroke:#22c55e,color:#f0fdf4
    style START fill:#0f172a,stroke:#64748b,color:#f1f5f9
    style END_SAFE fill:#4a1e1e,stroke:#ef4444,color:#fef2f2
    style END_GREET fill:#1e3a2f,stroke:#22c55e,color:#f0fdf4
    style END_GEN fill:#1e3a2f,stroke:#22c55e,color:#f0fdf4
```

---

## 3. Document Ingestion Pipeline

```mermaid
flowchart LR
    UP["POST\n/documents/upload\nmultipart form\nPDF/DOCX/Images"]

    subgraph DEDUP["DEDUP CHECK"]
        HASH["SHA256\nfile_hash\nCheck Qdrant\nfor existing hash"]
    end

    subgraph PARSE["PARSE  parser.py"]
        OCR["unstructured lib\nTesseract OCR\nsupport: uz/ru/en\nlibmagic, poppler\nlibreoffice, pandoc"]
    end

    subgraph CHUNK["CHUNK  chunker.py"]
        PC["Parent chunks\nsize=2000\noverlap=100"]
        CC["Child chunks\nsize=500\noverlap=100\nstores parent_text\n+ parent_chunk_index"]
        PC --> CC
    end

    subgraph DETECT["LANGUAGE DETECT"]
        LD["langdetect lib\nfirst 500 chars\nuz / ru / en\ntr→uz remap\nfallback: uz"]
    end

    subgraph EMBED["EMBED  embedding.py"]
        DE["Dense\nOllama nomic-embed-text-v2-moe\n768-dim cosine\nbatch=64\ntimeout=300s"]
        SE["Sparse (BM25)\nmodel-server /sparse-embed\nQdrant/bm25\nbatch=128\ntimeout=120s"]
    end

    subgraph HYP["HYPOTHETICAL Q  (per parent)"]
        HQ["LLM generates\n3 questions\nper parent chunk\nEmbed separately\npoint_type=hypothetical_question"]
    end

    subgraph STORE["STORE"]
        QD["Qdrant\ncollection: documents\nPayload:\ndocument_id, file_hash\npage_number, language\nchunk_index, section_header\nelement_types, point_type\ncreated_at"]
        MN["MinIO\nbucket: documents\nkey: {doc_id}/{filename}\noriginal file bytes"]
    end

    UP --> HASH
    HASH -->|"new file"| OCR
    HASH -->|"duplicate\nskip"| SKIP["409 Conflict"]
    OCR --> PC
    CC --> LD
    LD --> DE & SE
    DE & SE --> QD
    PC --> HQ
    HQ --> QD
    UP --> MN

    style DEDUP fill:#2a2a1e,stroke:#eab308,color:#fefce8
    style PARSE fill:#1e2a4a,stroke:#3b82f6,color:#eff6ff
    style CHUNK fill:#1e2a4a,stroke:#3b82f6,color:#eff6ff
    style DETECT fill:#2a1e4a,stroke:#a855f7,color:#faf5ff
    style EMBED fill:#2a1e4a,stroke:#a855f7,color:#faf5ff
    style HYP fill:#1e3a2f,stroke:#22c55e,color:#f0fdf4
    style STORE fill:#2a2a1e,stroke:#eab308,color:#fefce8
```

---

## 4. Hybrid Search Internals (Qdrant RRF)

```mermaid
flowchart TD
    Q["User Query\n(rewritten by query_prepare)"]

    subgraph EMBED_Q["QUERY EMBEDDING"]
        QDE["Dense embed\nOllama /api/embed\ntimeout=60s"]
        QSE["Sparse embed\nmodel-server /sparse-embed\ntimeout=120s"]
    end

    subgraph QDRANT_SEARCH["QDRANT HYBRID SEARCH"]
        DP["Dense prefetch\ncosine similarity\ntop=30"]
        SP["Sparse prefetch\nBM25 scoring\ntop=30"]
        RRF["RRF Fusion\nReciprocal Rank Fusion\nk=40\nformula: 1/(k+rank)"]
        FILT["Metadata filter\n(optional)\nlanguage, document_id\nfile_type, section_header"]
        BOOST["Language boost\n+10% score\nif doc.language ==\nquery.language"]
        TOP["Top-15 results\nwith scores"]
    end

    subgraph RERANK["CROSS-ENCODER RERANK"]
        CE["model-server :8080\nPOST /rerank\njina-reranker-v1-tiny-en\ntimeout=30s\ntop_k=7"]
    end

    subgraph GRADE["GRADING"]
        THR{"score ≥ 0.15?\nkeep top 3 minimum"}
        HITL{"max_score < 0.25\nAND retries ≥ 1?"}
        RETRY{"retries < 3?"}
    end

    subgraph EXPAND["CONTEXT EXPANSION"]
        PAR["parent_text\nfrom payload (fast path)"]
        NEIGH["neighbor chunks\nwindow=1 (slow path)"]
        DEDUP["Deduplication\nby chunk_index"]
    end

    Q --> QDE & QSE
    QDE --> DP
    QSE --> SP
    DP & SP --> RRF
    FILT --> RRF
    RRF --> BOOST
    BOOST --> TOP
    TOP --> CE
    CE --> THR
    THR -->|"pass"| EXPAND
    THR -->|"fail"| HITL
    HITL -->|"yes → interrupt"| HF["human_feedback\ninterrupt()"]
    HITL -->|"no"| RETRY
    RETRY -->|"yes → rewrite"| RW["rewrite_query"]
    RETRY -->|"no (≥3) → force generate"| EXPAND
    PAR & NEIGH --> DEDUP
    DEDUP --> GEN["generate node"]

    style EMBED_Q fill:#2a1e4a,stroke:#a855f7,color:#faf5ff
    style QDRANT_SEARCH fill:#2a2a1e,stroke:#eab308,color:#fefce8
    style RERANK fill:#1e2a4a,stroke:#3b82f6,color:#eff6ff
    style GRADE fill:#4a1e1e,stroke:#ef4444,color:#fef2f2
    style EXPAND fill:#1e3a2f,stroke:#22c55e,color:#f0fdf4
```

---

## 5. Chat Request — Full Sequence Diagram

```mermaid
sequenceDiagram
    participant B as Browser
    participant FE as React Frontend
    participant API as FastAPI :8000
    participant MONGO as MongoDB
    participant LG as LangGraph Agent
    participant QD as Qdrant :6333
    participant MS as Model Server :8080
    participant OLLAMA as Ollama :11434
    participant LLM as LLM Provider

    B->>FE: Submit message
    FE->>API: POST /chat/stream\n{query, session_id?, language}\nBearer JWT

    API->>API: Validate JWT\nExtract user_id

    alt No session_id
        API->>MONGO: Create chat_session\n{user_id, title="New Chat"}
        MONGO-->>API: thread_id (UUID)
        API-->>FE: SSE: session_created\n{thread_id}
    else Existing session_id
        API->>MONGO: Load chat_session\nVerify user_id matches
    end

    API->>LG: graph.astream_events(\n  {query, language, user_id},\n  {thread_id, checkpoint_ns}\n)

    Note over LG: NODE: input_safety
    LG->>LLM: Check safety\nInputSafetyResult\nstructured output
    LLM-->>LG: {is_safe, reason, category}

    alt Blocked
        LG-->>API: END (safe response)
        API-->>FE: SSE: generation\n{answer: canned response}
    else Safe
        API-->>FE: SSE: node_end\n{node: "input_safety"}

        Note over LG: NODE: intent_router
        LG->>LG: Pattern match\ngreeting/thanks regex
        opt No pattern match
            LG->>LLM: Classify intent\nhr_query vs general_query
        end
        API-->>FE: SSE: node_end\n{node: "intent_router"}

        alt greeting/thanks
            LG->>LG: greeting_response\n(no LLM)
            API-->>FE: SSE: generation\n{answer: multilingual greeting}
        else general_query
            LG->>LLM: general_response\nDirect answer
            LLM-->>LG: stream tokens
            LG->>LLM: output_safety check
            API-->>FE: SSE: generation\n{answer}
        else hr_query
            Note over LG: NODE: query_prepare
            LG->>LLM: Single LLM call:\n• rewrite query\n• 3 alternative queries\n• step-back query\n• metadata filters
            LLM-->>LG: JSON {queries[], filters{}}
            API-->>FE: SSE: node_end\n{node: "query_prepare"}

            Note over LG: NODE: retrieve (may loop 3x)
            LG->>OLLAMA: POST /api/embed\nbatch dense embed\ntimeout=60s
            OLLAMA-->>LG: [768-dim vectors]
            LG->>MS: POST /sparse-embed\nBM25 vectors\ntimeout=120s
            MS-->>LG: [{indices, values}]
            LG->>QD: Hybrid search\nPrefetch dense top=30\nPrefetch sparse top=30\nRRF k=40 → top=15\n+language boost 10%
            QD-->>LG: [15 documents + scores]
            API-->>FE: SSE: node_end\n{node: "retrieve"}

            Note over LG: NODE: rerank
            LG->>MS: POST /rerank\n{query, texts[15], top_k=7}\ntimeout=30s
            MS-->>LG: [{index, score}] sorted
            API-->>FE: SSE: node_end\n{node: "rerank"}

            Note over LG: NODE: grade_documents
            LG->>LG: Filter: score ≥ 0.15\nKeep min top 3
            alt max_score < 0.25 AND retries ≥ 1
                LG-->>API: interrupt(clarification_q)
                API-->>FE: SSE: clarification_needed\n{question: multilingual}
                FE-->>B: Show ClarificationPrompt
                B-->>FE: User types clarification
                FE->>API: POST /chat/resume\n{thread_id, response}
                API->>LG: Command(resume=response)\nReset docs + retries
                Note over LG: Re-enters retrieve loop
            else fail AND retries < 3
                LG->>LLM: rewrite_query\nretries++
                LLM-->>LG: reformulated query
                Note over LG: Back to retrieve
            else pass
                Note over LG: NODE: expand_context
                LG->>MONGO: Lookup neighbor chunks\nwindow=1 (slow path)
                MONGO-->>LG: Adjacent chunks
                LG->>LG: Merge + deduplicate
                API-->>FE: SSE: node_end\n{node: "expand_context"}

                Note over LG: NODE: generate
                LG->>LLM: System prompt + context\nConversation history\nContext budget: model_ctx - 4k tokens\nStream response
                LLM-->>LG: Token stream

                Note over LG: NODE: output_safety
                LG->>LLM: Check output\nOutputSafetyResult
                LLM-->>LG: {is_safe, reason}

                API-->>FE: SSE: generation\n{answer, sources[]}
            end
        end
    end

    API->>MONGO: Upsert session\n{message_count++,\nlast_active_at}

    opt First exchange
        API->>LLM: Generate session title\n(async, non-blocking)
        LLM-->>API: Short title string
        API->>MONGO: Update session title
        API-->>FE: SSE: session_title\n{title}
    end
```

---

## 6. Authentication & JWT Flow

```mermaid
sequenceDiagram
    participant B as Browser
    participant FE as apiClient.ts
    participant API as FastAPI /auth
    participant MONGO as MongoDB users

    Note over B,MONGO: REGISTER / LOGIN
    B->>FE: POST /auth/login\n{username, password}
    FE->>API: Forward (no auth header)
    API->>MONGO: Find user by username
    MONGO-->>API: {hashed_password, role, id}
    API->>API: bcrypt.verify(password, hash)
    API-->>FE: 200 {access_token (30m HS256),\nrefresh_token (7d HS256)}
    FE->>FE: Store access_token in memory\nStore refresh_token in localStorage

    Note over B,MONGO: AUTHENTICATED REQUEST
    B->>FE: Any API call
    FE->>API: Request + Authorization: Bearer {access_token}
    API->>API: Verify JWT signature\nCheck expiry\nExtract {user_id, role}
    API-->>FE: 200 Response

    Note over B,MONGO: TOKEN REFRESH (auto, transparent)
    FE->>API: Request + expired access_token
    API-->>FE: 401 Unauthorized
    FE->>API: POST /auth/refresh\n{refresh_token}
    API->>MONGO: Validate refresh token\n(not revoked)
    MONGO-->>API: User record
    API-->>FE: New {access_token}
    FE->>FE: Update stored access_token
    FE->>API: Retry original request\nNew Bearer token
    API-->>FE: 200 Response

    Note over B,MONGO: ADMIN SEEDING (startup)
    API->>MONGO: Find admin user
    alt Not exists
        API->>MONGO: Create admin\nbcrypt(ADMIN_PASSWORD)\nrole=admin
    end
```

---

## 7. Resource Requirements (Per Service)

```mermaid
graph LR
    subgraph INFRA["INFRASTRUCTURE RESOURCES"]
        direction TB

        FE_R["Frontend (node:20-alpine)\nCPU: 0.25 core\nRAM: 256 MB\nDisk: ~500 MB (node_modules)\nPort: 5173"]

        API_R["FastAPI (python:3.12-slim)\nCPU: 1–2 cores\nRAM: 1–2 GB\n(tesseract OCR = heavy)\nDisk: ~3 GB (libreoffice,\ntesseract uz/ru/en, pandoc,\nOpenCV, PyTorch CPU)\nPort: 8000"]

        LG_R["LangGraph Server (python:3.12-slim)\nCPU: 0.5–1 core\nRAM: 512 MB – 1 GB\nDisk: ~1 GB\nPort: 8123→8000"]

        MS_R["Model Server (python:3.12-slim)\nCPU: 2–4 cores (CPU inference)\nRAM: 2–4 GB\n(jina-reranker model ~500 MB\n+ BM25 model ~100 MB)\nDisk: 1–2 GB (model cache)\nPort: 8080\nStart period: 120s (model download)"]

        MONGO_R["MongoDB 7\nCPU: 0.5 core\nRAM: 512 MB – 2 GB\nDisk: 10–50 GB (sessions,\nLangGraph checkpoints)\nPort: 27017"]

        QDRANT_R["Qdrant\nCPU: 1–2 cores\nRAM: 1–4 GB\n(768-dim vectors)\n~1 GB per 1M vectors\nDisk: 5–20 GB\nPorts: 6333 HTTP, 6334 gRPC"]

        REDIS_R["Redis 7-alpine\nCPU: 0.1 core\nRAM: 64–256 MB\nDisk: minimal\nPort: 6379"]

        MINIO_R["MinIO\nCPU: 0.25 core\nRAM: 256–512 MB\nDisk: 10–100 GB\n(original documents)\nPorts: 9000, 9001"]

        OLLAMA_R["Ollama (host machine)\nCPU: 4–8 cores\nRAM: 8–16 GB\n(nomic-embed 768 ~700 MB\n+ llama3.1 8B ~4.7 GB)\nGPU: optional (speeds ×10)\nPort: 11434"]
    end

    style FE_R fill:#1e3a2f,stroke:#22c55e,color:#f0fdf4
    style API_R fill:#1e2a4a,stroke:#3b82f6,color:#eff6ff
    style LG_R fill:#1e2a4a,stroke:#3b82f6,color:#eff6ff
    style MS_R fill:#2a1e4a,stroke:#a855f7,color:#faf5ff
    style MONGO_R fill:#2a2a1e,stroke:#eab308,color:#fefce8
    style QDRANT_R fill:#2a2a1e,stroke:#eab308,color:#fefce8
    style REDIS_R fill:#2a2a1e,stroke:#eab308,color:#fefce8
    style MINIO_R fill:#2a2a1e,stroke:#eab308,color:#fefce8
    style OLLAMA_R fill:#2a1e4a,stroke:#a855f7,color:#faf5ff
```

---

## 8. Resource Summary Table

| Service | Image | CPU | RAM | Disk | GPU |
|---------|-------|-----|-----|------|-----|
| **Frontend** | node:20-alpine | 0.25 core | 256 MB | 500 MB | — |
| **FastAPI** | python:3.12-slim | 1–2 cores | 1–2 GB | 3 GB | — |
| **LangGraph Server** | python:3.12-slim | 0.5–1 core | 512 MB–1 GB | 1 GB | — |
| **Model Server** | python:3.12-slim | 2–4 cores | 2–4 GB | 1–2 GB | Optional |
| **MongoDB 7** | mongo:7 | 0.5 core | 512 MB–2 GB | 10–50 GB | — |
| **Qdrant** | qdrant/qdrant | 1–2 cores | 1–4 GB | 5–20 GB | — |
| **Redis** | redis:7-alpine | 0.1 core | 64–256 MB | minimal | — |
| **MinIO** | minio/minio | 0.25 core | 256–512 MB | 10–100 GB | — |
| **Ollama (host)** | host binary | 4–8 cores | 8–16 GB | 10–20 GB | Optional |
| **TOTAL (min)** | | **~10 cores** | **~14 GB** | **~42 GB** | — |
| **TOTAL (recommended)** | | **~16 cores** | **~28 GB** | **~100 GB** | 8 GB VRAM |

> **Ollama GPU**: nomic-embed-text ~700 MB VRAM + llama3.1:8B ~5 GB VRAM = ~6 GB minimum. RTX 3060 (12 GB) or better recommended.

---

## 9. Key Configuration Numbers

```mermaid
mindmap
  root((Agentic RAG\nConfig))
    Chunking
      chunk_size 500 tokens
      overlap 100 tokens
      parent_chunk_size 2000
      hypothetical_questions 3 per parent
    Retrieval
      prefetch_limit 30 per modality
      rrf_k 40
      top_k 15 after fusion
      language_boost +10%
    Reranking
      rerank_top_k 7
      score_threshold 0.15
      min_keep top 3
      HITL_trigger max_score lt 0.25
    Embedding
      dense_dim 768
      dense_batch 64
      sparse_batch 128
      ollama_timeout 300s
      query_timeout 60s
      sparse_timeout 120s
    Agent
      max_retries 3
      reranker_timeout 30s
      context_reserve 4000 tokens
    Auth
      access_expiry 30 min
      refresh_expiry 7 days
      algorithm HS256
    Health
      interval 10s
      timeout 5s
      retries 5
      model_server_start 120s
```

---

## 10. Network & SSL Architecture

```mermaid
flowchart TD
    subgraph DOCKER_NET["Docker Network: rag-network (bridge, MTU 1500)"]
        FE_C["frontend :5173"]
        API_C["fastapi :8000"]
        LG_C["langgraph-server\ninternal :8000\nexternal :8123"]
        MS_C["model-server :8080"]
        QD_C["qdrant :6333/:6334"]
        MG_C["mongodb :27017"]
        RD_C["redis :6379"]
        MN_C["minio :9000/:9001"]
    end

    HOST["Host Machine"]
    OLLAMA_H["Ollama :11434\n(host.docker.internal)"]
    CLAUDE["Claude API\napi.anthropic.com"]
    OPENAI["OpenAI API\napi.openai.com"]
    CORP_FW["Corporate Firewall\nSSL Inspection\n(verify=False bypass)"]

    API_C -->|"http (internal)"| QD_C & MG_C & RD_C & MN_C & MS_C
    API_C -->|"host.docker.internal:11434"| OLLAMA_H
    API_C -->|"HTTPS verify=False\nPYTHONHTTPSVERIFY=0"| CORP_FW
    LG_C -->|"HTTPS verify=False\nsitecustomize.py"| CORP_FW
    CORP_FW --> CLAUDE & OPENAI
    HOST -->|"port mapping"| FE_C & API_C & LG_C

    style CORP_FW fill:#4a1e1e,stroke:#ef4444,color:#fef2f2
    style CLAUDE fill:#2a1e4a,stroke:#a855f7,color:#faf5ff
    style OPENAI fill:#1e3a2f,stroke:#22c55e,color:#f0fdf4
```

---

## 11. Data Models & MongoDB Collections

```mermaid
erDiagram
    USERS {
        ObjectId _id PK
        string username UK
        string hashed_password
        string role "admin|user"
        datetime created_at
        datetime updated_at
    }

    CHAT_SESSIONS {
        string thread_id PK
        string user_id FK
        string title
        int message_count
        datetime created_at
        datetime updated_at
    }

    MESSAGE_FEEDBACK {
        ObjectId _id PK
        string thread_id FK
        int message_index
        string feedback "up|down"
        string note "required for down"
        datetime created_at
    }

    LANGGRAPH_CHECKPOINTS {
        string thread_id FK
        string checkpoint_id PK
        string checkpoint_ns
        json state "AgentState TypedDict"
        datetime created_at
    }

    USERS ||--o{ CHAT_SESSIONS : "owns"
    CHAT_SESSIONS ||--o{ MESSAGE_FEEDBACK : "has"
    CHAT_SESSIONS ||--o{ LANGGRAPH_CHECKPOINTS : "persists"
```

---

## 12. Qdrant Point Schema

```mermaid
graph TD
    subgraph POINT["Qdrant Point (per chunk)"]
        ID["id: UUID"]
        DENSE["vector.dense: float[768]\nnomic-embed-text-v2-moe\ncosine distance"]
        SPARSE["vector.sparse: SparseVector\nindices: int[]\nvalues: float[]\nQdrant/bm25"]
        PAYLOAD["payload:\n• text: str (chunk content)\n• parent_text: str (2000-tok parent)\n• document_id: UUID\n• file_hash: SHA256\n• source: filename\n• page_number: int\n• page_start / page_end: int\n• chunk_index: int\n• parent_chunk_index: int\n• section_header: str\n• element_types: str[]\n• language: 'uz'|'ru'|'en'\n• point_type: 'chunk'|'hypothetical_question'\n• created_at: ISO datetime"]
    end

    subgraph INDEXES["Payload Indexes"]
        KW["Keyword indexes:\ndocument_id, source, file_type\nlanguage, file_hash\nsection_header, element_types\npoint_type"]
        INT["Integer indexes:\npage_number, chunk_index\nparent_chunk_index"]
        FT["Full-text index:\ntext field\nmultilingual tokenizer\nlowercase=true"]
        DT["Datetime index:\ncreated_at"]
    end

    POINT --> INDEXES
```

---

*To render these diagrams:*
- **GitHub/GitLab/Notion**: Paste `.md` content directly — Mermaid renders natively
- **VS Code**: Install "Markdown Preview Mermaid Support" extension
- **draw.io version**: Run `/drawio-gen` skill for importable `.drawio` XML
- **PNG export**: `npx @mermaid-js/mermaid-cli -i architecture.md -o architecture.svg`
