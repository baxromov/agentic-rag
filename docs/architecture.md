# Agentic RAG — System Architecture Diagrams

Architecture diagrams for the Ipoteka Bank Agentic RAG system. All diagrams reflect the current codebase state as of the last review.

---

## Diagram 1 — Service Topology (Docker Compose)

All running services, their exposed ports, and inter-service communication paths.

```mermaid
graph TD
    Browser["Browser"] --> Frontend["Frontend\nReact 19 + Vite 7\n:5173"]
    Frontend -->|"REST + SSE\nBearer JWT"| API["FastAPI\n:8000"]
    Frontend -->|"REST"| LangGraphServer["LangGraph Server\n:8123 (legacy)"]

    API --> MongoDB[(MongoDB 7\nAuth + Sessions\nGraph State\n:27017)]
    API --> Qdrant[(Qdrant\nVector DB\nHybrid Index\n:6333)]
    API --> Redis[(Redis 7\nPub/Sub\n:6379)]
    API --> MinIO[(MinIO\nDocument Storage\nS3-compatible\n:9000 / :9001)]
    API -->|"HTTP rerank + sparse-embed"| ModelServer["Model Server\njina-reranker-v2\nFastEmbed BM25\n:8080"]
    API -->|"HTTP embed"| Ollama["Ollama\nnomic-embed-text\n768-dim\n:11434 (host)"]
    API -->|"API call"| LLMProvider["LLM Provider\nClaude / OpenAI / Ollama\n(configured via LLM_PROVIDER)"]
    API -->|"optional OTEL"| Langfuse["Langfuse v3\nObservability\n:3000 (disabled by default)"]

    LangGraphServer --> MongoDB
    LangGraphServer --> Qdrant
    LangGraphServer --> Redis
    LangGraphServer --> MinIO
    LangGraphServer --> ModelServer
    LangGraphServer --> Ollama

    MinIOInit["minio-init\nbucket bootstrap"] --> MinIO

    style Frontend fill:#d5e8d4,stroke:#82b366
    style API fill:#dae8fc,stroke:#6c8ebf
    style LangGraphServer fill:#dae8fc,stroke:#6c8ebf
    style MongoDB fill:#f5f5f5,stroke:#666
    style Qdrant fill:#f5f5f5,stroke:#666
    style Redis fill:#fff2cc,stroke:#d6b656
    style MinIO fill:#f5f5f5,stroke:#666
    style ModelServer fill:#e1d5e7,stroke:#9673a6
    style Ollama fill:#e1d5e7,stroke:#9673a6
    style LLMProvider fill:#f8cecc,stroke:#b85450
    style Langfuse fill:#ffe6cc,stroke:#d79b00
    style MinIOInit fill:#f5f5f5,stroke:#999,stroke-dasharray:4
```

**Key notes:**
- Langfuse is fully configured in `docker-compose.yml` but commented out. Re-enable via `LANGFUSE_ENABLED=true` in `.env`.
- Ollama runs on the host machine; Docker containers reach it via `host.docker.internal:11434`.
- LangGraph Server (`:8123`) is a separate container kept for legacy compatibility. The FastAPI backend uses direct graph invocation via `MongoDBSaver` — no langgraph-server dependency for chat.
- Model Server handles both cross-encoder reranking and BM25 sparse embeddings.

---

## Diagram 2 — LangGraph Agent Flow

Full state machine with all nodes, conditional edges, and routing logic. Matches `src/agent/graph.py` exactly.

```mermaid
flowchart TD
    START([START]) --> input_safety

    input_safety{"input_safety\nLangChain LLM Guardrail\nStructuredOutput: InputSafetyResult"}
    input_safety -->|"blocked\nguardrail_blocked=True"| END_SAFE([END\nCanned safe response])
    input_safety -->|safe| intent_router

    intent_router{"intent_router\nPattern match + LLM\nStructuredOutput: IntentResult\nroute_by_intent()"}
    intent_router -->|greeting_response| greeting_response
    intent_router -->|general_response| general_response
    intent_router -->|"rewrite_for_retrieval\n(hr_query)"| query_prepare

    greeting_response["greeting_response\nMultilingual uz/ru/en\nNo LLM call"] --> END_GREET([END])

    general_response["general_response\nDirect LLM answer\nNo RAG retrieval"] --> output_safety

    query_prepare["query_prepare\nSingle LLM call:\n- query rewrite\n- multi-query\n- step-back\n- metadata filters"] --> retrieve

    retrieve["retrieve\nHybrid search:\ndense (nomic-embed-text)\n+ sparse (BM25 via model-server)\nRRF fusion + language boost"] --> rerank

    rerank["rerank\nCross-encoder HTTP call\njina-reranker-v2-base-multilingual\nmodel-server :8080"] --> grade_documents

    grade_documents["grade_documents\nScore threshold filter\nsets needs_clarification\nif all scores &lt; 0.25 after retry"] --> human_feedback

    human_feedback{"human_feedback\nLangGraph interrupt()\nshould_retry() routing"}
    human_feedback -->|"generate\n(scores pass OR docs found)"| expand_context
    human_feedback -->|"rewrite\n(retries &lt; 3)"| rewrite_query
    human_feedback -->|"interrupted\n(HITL trigger)"| PAUSED([PAUSED\nAwaiting clarification\nclarification_needed SSE event])

    PAUSED -->|"POST /chat/resume\nCommand(resume=response)"| human_feedback

    rewrite_query["rewrite_query\nLLM reformulates query\nretries += 1"] --> retrieve

    expand_context["expand_context\nParent chunk lookup\n+ neighbor chunks\nvia Qdrant scroll"] --> generate

    generate["generate\nLLM response generation\nContext budget management\nSources included"] --> output_safety

    output_safety{"output_safety\nConstitutional LLM Guardrail\nStructuredOutput: OutputSafetyResult\nChecks: identity leakage,\nprovider mention, off-character"}
    output_safety -->|safe| END_GEN([END\nGeneration + Sources])
    output_safety -->|"blocked\n(sanitized response)"| END_GEN

    style input_safety fill:#f8cecc,stroke:#b85450
    style output_safety fill:#f8cecc,stroke:#b85450
    style intent_router fill:#fff2cc,stroke:#d6b656
    style grade_documents fill:#fff2cc,stroke:#d6b656
    style human_feedback fill:#e1d5e7,stroke:#9673a6
    style retrieve fill:#dae8fc,stroke:#6c8ebf
    style rerank fill:#dae8fc,stroke:#6c8ebf
    style expand_context fill:#dae8fc,stroke:#6c8ebf
    style generate fill:#d5e8d4,stroke:#82b366
    style query_prepare fill:#d5e8d4,stroke:#82b366
    style greeting_response fill:#d5e8d4,stroke:#82b366
    style general_response fill:#d5e8d4,stroke:#82b366
    style rewrite_query fill:#ffe6cc,stroke:#d79b00
    style PAUSED fill:#e1d5e7,stroke:#9673a6,stroke-dasharray:5
```

**Key implementation details:**
- `grade_documents` sets `needs_clarification=True` but always proceeds to `human_feedback` node (no conditional edge before it).
- `human_feedback` uses `should_retry()` for conditional routing: routes to `expand_context` (generate) or `rewrite_query` (retry). When `interrupt()` fires the graph suspends — it does not route.
- `output_safety` receives output from both `general_response` and `generate` paths.
- HITL resume resets `retries=0`, `documents=[]`, appends clarification to query string, then re-enters at `retrieve`.

---

## Diagram 3 — Document Ingestion Pipeline

Upload-to-index data flow. Reflects `src/ingestion/pipeline.py`, `parser.py`, `chunker.py`, and `embedding.py`.

```mermaid
flowchart LR
    Upload["POST /documents/upload\nmultipart form\nPDF / DOCX / Images"] --> DupCheck

    DupCheck{"Duplicate check\nSHA256 hash\nvs Qdrant file_hash index"}
    DupCheck -->|"already exists"| SkipReturn([Return: skipped=True])
    DupCheck -->|"new document"| StoreMinIO

    StoreMinIO["MinIO upload\ndocuments bucket\ndocument_id/filename"] --> Parse

    subgraph Ingestion Pipeline
        Parse["parser.py\nUnstructured library\nTesseract OCR (multilingual)\nPDF/DOCX/HTML/Images\nOutputs: elements with page_number,\nsection_header, element_type"] --> Chunk

        Chunk["chunker.py\nRecursiveCharacterTextSplitter\nchild: size=500 overlap=100\nparent: size=2000\nPreserves: page range, section header,\nelement types per chunk"] --> LangDetect

        LangDetect["Language Detection\nlangdetect library (batch)\nen / ru / uz\ntr -> uz mapping"] --> ContextualHeader

        ContextualHeader["Contextual embedding\nPrepend section_header\nto embedding text only\n(not stored in payload)"] --> EmbedConcurrent

        EmbedConcurrent["Concurrent embedding\nasyncio.gather()"]

        EmbedConcurrent --> DenseEmbed["Dense embedding\nOllama nomic-embed-text\n768-dim cosine\nbatch size: 64\nvia httpx AsyncClient"]
        EmbedConcurrent --> SparseEmbed["Sparse embedding\nModel Server BM25/IDF\nFastEmbed SPLADE\nbatch size: 128\nvia httpx AsyncClient"]
    end

    DenseEmbed --> Upsert
    SparseEmbed --> Upsert

    Upsert["Qdrant upsert\ndense + sparse vectors\nPointStruct with full payload"]

    Upsert --> QdrantIndex[(Qdrant Collection\nVectors: dense 768-dim\nSparse: BM25 IDF modifier\nFull-text: MULTILINGUAL tokenizer\nPayload indexes: document_id,\nsource, language, file_hash,\nchunk_index, page_number,\nsection_header, point_type)]

    Upsert --> HypoQ{"enable_hypothetical\n_questions?"}
    HypoQ -->|yes| GenQuestions["LLM: generate 3 questions\nper unique parent chunk\n(HyDE-style indexing)\nEmbed + upsert as\npoint_type=hypothetical_question"]
    HypoQ -->|no| Done([Return: chunks_count, point_ids])
    GenQuestions --> Done

    style Parse fill:#dae8fc,stroke:#6c8ebf
    style Chunk fill:#dae8fc,stroke:#6c8ebf
    style LangDetect fill:#e1d5e7,stroke:#9673a6
    style ContextualHeader fill:#e1d5e7,stroke:#9673a6
    style DenseEmbed fill:#e1d5e7,stroke:#9673a6
    style SparseEmbed fill:#e1d5e7,stroke:#9673a6
    style Upsert fill:#dae8fc,stroke:#6c8ebf
    style QdrantIndex fill:#f5f5f5,stroke:#666
    style DupCheck fill:#fff2cc,stroke:#d6b656
    style HypoQ fill:#fff2cc,stroke:#d6b656
    style StoreMinIO fill:#f5f5f5,stroke:#666
```

**Key notes:**
- Dense and sparse embeddings run concurrently via `asyncio.gather()` — significant speedup on large documents.
- Language detection uses `langdetect` library (not LLM) — corrects `tr` -> `uz` for Uzbek Latin script confusion.
- Hypothetical questions (HyDE) are optional, controlled by `enable_hypothetical_questions` setting.
- Chunk size defaults: `CHUNK_SIZE=500`, `CHUNK_OVERLAP=100`, `PARENT_CHUNK_SIZE=2000`.

---

## Diagram 4 — Chat Request Sequence (SSE + HITL)

Full SSE streaming flow from browser through FastAPI to LangGraph and back. Reflects `src/api/routes/chat.py`.

```mermaid
sequenceDiagram
    participant B as Browser
    participant FE as Frontend (React)
    participant API as FastAPI :8000
    participant Guard as Guardrails (validate_input)
    participant LG as LangGraph Agent
    participant DB as MongoDB (sessions + graph state)
    participant QD as Qdrant :6333
    participant RR as Model Server :8080
    participant LLM as LLM Provider

    B->>FE: Submit message
    FE->>API: POST /chat/stream (SSE)\n{query, session_id?, filters?}\nBearer JWT

    API->>Guard: validate_input(query)\nPII mask, injection detect, length check
    Guard-->>API: {masked_query, warnings[]}

    API->>DB: Resolve session (get_session)\nor create_session() if new
    DB-->>API: session record
    API-->>FE: SSE: session_created {session_id}

    API->>LG: graph.astream(input, config)\nstream_mode="updates"\n+Langfuse callback if enabled

    Note over LG: input_safety node
    LG->>LLM: LLM guardrail check (InputSafetyResult)
    LLM-->>LG: safe / blocked

    alt blocked
        LG-->>API: node_end: input_safety (guardrail_blocked=True)
        API-->>FE: SSE: node_end {node: input_safety}
    else safe
        Note over LG: intent_router node
        LG->>LLM: intent classification (IntentResult)
        LLM-->>LG: greeting / general_query / hr_query

        alt hr_query path
            Note over LG: query_prepare node
            LG->>LLM: rewrite + multi-query + step-back + filters
            LLM-->>LG: prepared query

            Note over LG: retrieve node
            LG->>QD: hybrid_search (dense + sparse RRF)\nPrefetch limit: 30, top_k: 15
            QD-->>LG: top-K candidates with scores

            Note over LG: rerank node
            LG->>RR: POST /rerank {query, documents}
            RR-->>LG: scored + sorted documents

            Note over LG: grade_documents node
            LG->>LG: score threshold check (< 0.25?)

            alt all scores below threshold after retry
                LG->>LG: interrupt(clarification_question)
                LG-->>API: graph paused (state.next non-empty)
                API-->>FE: SSE: clarification_needed {question, session_id}
                FE-->>B: Show ClarificationPrompt component

                B-->>FE: User types clarification
                FE->>API: POST /chat/resume\n{session_id, response}
                API->>LG: graph.astream(Command(resume=response))
                Note over LG: human_feedback node resumes\nQuery updated, docs cleared, retries=0
            end

            Note over LG: expand_context node
            LG->>QD: scroll surrounding chunks (parent + neighbors)
            QD-->>LG: expanded context

            Note over LG: generate node
            LG->>LLM: generate response (context budget mgmt)
            LLM-->>LG: streamed tokens
        end

        Note over LG: output_safety node
        LG->>LLM: OutputSafetyResult check
        LLM-->>LG: safe / blocked
    end

    loop per graph node update
        LG-->>API: node update event
        API-->>FE: SSE: node_end {node, data}
    end

    API->>DB: graph.aget_state(config) for final values
    DB-->>API: final state (generation, documents, retries)

    API-->>FE: SSE: generation {answer, sources, retries, session_id}

    API->>LLM: _generate_title() if new session
    LLM-->>API: short title (3-6 words)
    API-->>FE: SSE: session_title {title}
    API->>DB: update_session(message_count, title)
```

---

## Diagram 5 — Authentication Flow (JWT)

JWT-based auth with access + refresh token rotation. Reflects `src/api/routes/auth.py` and `frontend/src/config/apiClient.ts`.

```mermaid
sequenceDiagram
    participant B as Browser
    participant FE as Frontend (apiClient.ts)
    participant Auth as authStore (Zustand)
    participant API as FastAPI /auth
    participant DB as MongoDB users

    B->>FE: Enter username + password
    FE->>API: POST /auth/login\n{username, password}
    API->>DB: find_one({username})\nbcrypt.verify(password, hash)
    DB-->>API: User record (is_active check)
    API-->>FE: {access_token (30m JWT), refresh_token (7d JWT),\ntoken_type: "bearer"}
    FE->>Auth: setTokens(access, refresh)
    Auth->>Auth: Store in memory + localStorage

    loop Every authenticated API call
        FE->>API: Request + Authorization: Bearer {access_token}
        API->>API: verify JWT signature + expiry\ndecode sub -> username
        API->>DB: find_one({username}) — verify user still active
        DB-->>API: User record
        API-->>FE: 200 Response
    end

    Note over FE,API: When access token expires (401 response)
    FE->>API: POST /auth/refresh\n{refresh_token}
    API->>API: verify refresh JWT signature + expiry\ncheck token type == "refresh"
    API-->>FE: {access_token (new 30m token)}
    FE->>Auth: Update access_token in store
    FE->>API: Retry original request with new token

    Note over FE: Admin seeded on startup (lifespan)\nADMIN_USERNAME / ADMIN_PASSWORD from .env
```

**Token details:**
- `ACCESS_TOKEN_EXPIRE_MINUTES=30` (default)
- `REFRESH_TOKEN_EXPIRE_DAYS=7` (default)
- `JWT_SECRET_KEY` — must be changed in production (default is insecure placeholder)
- `apiClient.ts` handles 401 transparently: refreshes token and retries original request once

---

## Diagram 6 — Hybrid Search Internals (Qdrant RRF)

How Qdrant combines dense and sparse vectors. Reflects `src/services/qdrant_client.py` `hybrid_search()` and `src/agent/nodes.py` retrieve node.

```mermaid
flowchart TD
    Query["User query (prepared by query_prepare node)\nMay contain: rewritten query + multi-queries + step-back"] --> Embed

    Embed["EmbeddingService\nasyncio.gather() concurrent"]
    Embed --> DenseEmbed["Dense embed\nOllama nomic-embed-text\n768-dim\nPOST /api/embed"]
    Embed --> SparseEmbed["Sparse embed\nModel Server BM25/IDF\nFastEmbed SPLADE\nPOST /sparse-embed"]

    subgraph Qdrant FusionQuery
        DenseEmbed --> DensePrefetch["Dense Prefetch\nusing: dense\ncosine similarity\nlimit: 30"]
        SparseEmbed --> SparsePrefetch["Sparse Prefetch\nusing: sparse\nIDF modifier\nlimit: 30"]
        DensePrefetch --> RRF["FusionQuery\nfusion: RRF (Reciprocal Rank Fusion)\nk=40\nBuilt-in Qdrant fusion"]
        SparsePrefetch --> RRF
        RRF --> TopK["Top-15 fused results\nwith RRF scores"]
    end

    TopK --> LangBoost["Language boost +10%\nsame-language docs\n(query_language match)"]
    LangBoost --> MultiQuery["Multi-query merge\nIf search_queries list:\nrun hybrid_search per query\nmerge + deduplicate by ID\ntake top retrieval_top_k"]

    MultiQuery --> Reranker["Cross-encoder reranking\njina-reranker-v2-base-multilingual\nModel Server :8080\nPOST /rerank\n{query, documents[]}"]
    Reranker --> Scored["Scored document list\n(score 0.0 - 1.0)"]

    Scored --> Threshold{"grade_documents\nscore threshold\n< 0.25?"}
    Threshold -->|"all below threshold\nafter retry"| HITL["needs_clarification=True\nhuman_feedback interrupt()"]
    Threshold -->|"retries < 3\nno HITL trigger"| Retry["rewrite_query\nLLM reformulation\nretries += 1"]
    Threshold -->|"pass (at least some >= 0.25)"| Expand["expand_context\nParent chunk lookup\n+ neighboring chunks\nvia Qdrant scroll (window=1)"]

    Expand --> Generate["generate node\nContext budget management\n(tiktoken token counting)\nAll rerank_top_k=7 docs"]

    style DenseEmbed fill:#dae8fc,stroke:#6c8ebf
    style SparseEmbed fill:#dae8fc,stroke:#6c8ebf
    style RRF fill:#fff2cc,stroke:#d6b656
    style Reranker fill:#e1d5e7,stroke:#9673a6
    style Threshold fill:#f8cecc,stroke:#b85450
    style HITL fill:#e1d5e7,stroke:#9673a6
    style Expand fill:#d5e8d4,stroke:#82b366
    style Generate fill:#d5e8d4,stroke:#82b366
    style Retry fill:#ffe6cc,stroke:#d79b00
```

**Configuration values (from `.env` / `settings.py`):**
- `RETRIEVAL_TOP_K=15` — results after RRF fusion
- `RETRIEVAL_PREFETCH_LIMIT=30` — candidates per dense/sparse branch
- `RERANK_TOP_K=7` — docs passed to generate node
- `RRF_K=40` — RRF denominator constant
- `EMBEDDING_DIM=768` — nomic-embed-text vector size

---

## Discrepancies Found vs Skill Template Diagrams

The following differences exist between the codebase and the skill template diagrams:

1. **`grade_documents` does NOT have a direct conditional edge to `expand_context` or `rewrite_query`.**
   The graph always proceeds `grade_documents` -> `human_feedback` -> `should_retry()` routing. The `should_retry()` function handles both the normal pass case and the retry case.

2. **Language detection uses `langdetect` library, not LLM.**
   The ingestion pipeline uses `langdetect` (batch, deterministic) — not an LLM call. The CLAUDE.md description is slightly inaccurate on this point.

3. **`general_response` goes through `output_safety` before END.**
   The template diagram shows `output_safety` only on the HR query path. Both `general_response` and `generate` route through `output_safety`.

4. **Sparse embeddings come from model-server (FastEmbed BM25), not full-text-only.**
   The hybrid search uses: dense via Ollama + sparse via model-server. Qdrant also has a full-text TEXT index on the `text` field, but the primary hybrid search uses the `sparse` vector field with BM25 IDF.

5. **Langfuse is disabled in docker-compose by default.**
   The service topology should show Langfuse as optional/commented-out, not as an active service.

6. **LangGraph Server (`:8123`) is a separate container but FastAPI uses direct graph invocation.**
   The backend does NOT call `langgraph-server` for chat — it invokes the graph directly via `MongoDBSaver` checkpointer. LangGraph Server is kept for legacy/alternative access.

7. **Hypothetical question generation (HyDE-style) exists in the ingestion pipeline.**
   The template diagram does not show this optional indexing step.

---

## Recommended Diagram Placement

| Diagram | Recommended Location |
|---------|---------------------|
| Service Topology | `README.md` top-level overview section |
| LangGraph Agent Flow | `docs/architecture.md` + link in README |
| Document Ingestion Pipeline | `docs/architecture.md` + `/documents/upload` API docstring |
| Chat Sequence (SSE + HITL) | `docs/architecture.md` + frontend `useStreamingChat.ts` header |
| Authentication Flow | `docs/architecture.md` + `src/api/routes/auth.py` header |
| Hybrid Search Internals | `docs/architecture.md` + `src/services/qdrant_client.py` header |
