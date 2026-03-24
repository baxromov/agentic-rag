---
name: system-arch
description: Generate complete system architecture diagrams and flow charts for this RAG application using Mermaid, draw.io XML, or ASCII art. Covers service topology, agent flow, data flow, sequence diagrams, and deployment diagrams.
context: fork
agent: rag-architect
---

# System Architecture Diagram Generator

Generate architecture and flow diagrams for this RAG application.

## What to generate
$ARGUMENTS

## Steps

1. **Read the project** — scan `CLAUDE.md`, `docker-compose.yml`, `src/agent/graph.py`, `src/api/routes/`, `src/ingestion/`, `src/services/` to understand the current state
2. **Choose format** based on the request:
   - `mermaid` — inline in Markdown, renders in GitHub/Notion/GitLab
   - `drawio` — full `.drawio` XML, import to draw.io / VS Code extension
   - `ascii` — plain text, embeds anywhere
3. **Generate all relevant diagrams** from the list below

---

## Diagrams to Produce

### 1. Service Topology (Docker Compose)
Show all running services, their ports, and inter-service connections.

**Mermaid template:**
```mermaid
graph TD
    Browser["Browser\n:5173"] --> Frontend["Frontend\nReact+Vite\n:5173"]
    Frontend --> API["FastAPI\n:8000"]
    API --> MongoDB[(MongoDB\n:27017)]
    API --> Qdrant[(Qdrant\n:6333)]
    API --> Redis[(Redis\n:6379)]
    API --> MinIO[(MinIO\n:9000)]
    API --> ModelServer["Model Server\nReranker\n:8080"]
    API --> Ollama["Ollama\nEmbeddings\n:11434"]
    API --> LLM["LLM Provider\nClaude/OpenAI/Ollama"]
    API --> Langfuse["Langfuse\nObservability\n:3000"]

    style Frontend fill:#d5e8d4,stroke:#82b366
    style API fill:#dae8fc,stroke:#6c8ebf
    style MongoDB fill:#f5f5f5,stroke:#666
    style Qdrant fill:#f5f5f5,stroke:#666
    style Redis fill:#fff2cc,stroke:#d6b656
    style MinIO fill:#f5f5f5,stroke:#666
    style ModelServer fill:#e1d5e7,stroke:#9673a6
    style Ollama fill:#e1d5e7,stroke:#9673a6
    style LLM fill:#f8cecc,stroke:#b85450
    style Langfuse fill:#ffe6cc,stroke:#d79b00
```

---

### 2. LangGraph Agent Flow
Show the full agent state machine with nodes, conditional edges, and routing logic.

**Mermaid template:**
```mermaid
flowchart TD
    START([START]) --> input_safety

    input_safety{"input_safety\nLLM Guardrail"}
    input_safety -->|blocked| END_SAFE([END - Safe Response])
    input_safety -->|safe| intent_router

    intent_router{"intent_router\nPattern + LLM"}
    intent_router -->|greeting| greeting_response
    intent_router -->|general_query| general_response
    intent_router -->|hr_query| query_prepare

    greeting_response["greeting_response\nMultilingual"] --> END_GREET([END])
    general_response["general_response\nDirect LLM"] --> output_safety_gen

    query_prepare["query_prepare\nRewrite + Multi-query\n+ Step-back + Filters"] --> retrieve

    retrieve["retrieve\nHybrid Search\ndense + full-text RRF"] --> rerank
    rerank["rerank\nCross-encoder\nmodel-server"] --> grade_documents

    grade_documents{"grade_documents\nScore threshold\n< 0.25?"}
    grade_documents -->|"pass (score ≥ 0.25)"| expand_context
    grade_documents -->|"fail + retry < 3"| rewrite_query
    grade_documents -->|"fail + HITL trigger"| human_feedback

    rewrite_query["rewrite_query\nLLM Reformulation"] --> retrieve

    human_feedback["human_feedback\ninterrupt()\nAwait user input"] -->|"resume with clarification"| retrieve

    expand_context["expand_context\nParent/neighbor chunks"] --> generate
    generate["generate\nLLM + Context budget"] --> output_safety

    output_safety{"output_safety\nConstitutional LLM\nGuardrail"}
    output_safety -->|safe| END_GEN([END - Response + Sources])
    output_safety -->|blocked| END_GEN
    output_safety_gen --> END_GEN

    style input_safety fill:#f8cecc,stroke:#b85450
    style output_safety fill:#f8cecc,stroke:#b85450
    style intent_router fill:#fff2cc,stroke:#d6b656
    style grade_documents fill:#fff2cc,stroke:#d6b656
    style human_feedback fill:#e1d5e7,stroke:#9673a6
    style retrieve fill:#dae8fc,stroke:#6c8ebf
    style rerank fill:#dae8fc,stroke:#6c8ebf
    style generate fill:#d5e8d4,stroke:#82b366
```

---

### 3. Document Ingestion Pipeline
Show the upload-to-index data flow.

**Mermaid template:**
```mermaid
flowchart LR
    Upload["POST /documents/upload\nmultipart form"] --> Parse

    subgraph Ingestion Pipeline
        Parse["parser.py\nUnstructured + Tesseract OCR\nPDF/DOCX/Images"] --> Chunk
        Chunk["chunker.py\nRecursiveCharacterTextSplitter\nchunk=1000 overlap=200\nparent_chunk=2000"] --> LangDetect
        LangDetect["LLM Language Detection\nbatch: uz/ru/en"] --> Embed
        Embed["embedding.py\nOllama nomic-embed-text\n768-dim batched httpx"] --> Upsert
    end

    Upsert --> Qdrant[(Qdrant\nVectors + Full-text\nHybrid Index)]
    Upload --> MinIO[(MinIO\nOriginal File\nSHA256 hash)]

    Qdrant --> Metadata["Metadata stored:\ndocument_id, file_hash\npage_number, language\nchunk_index"]

    style Parse fill:#dae8fc,stroke:#6c8ebf
    style Chunk fill:#dae8fc,stroke:#6c8ebf
    style LangDetect fill:#e1d5e7,stroke:#9673a6
    style Embed fill:#e1d5e7,stroke:#9673a6
    style Upsert fill:#dae8fc,stroke:#6c8ebf
    style Qdrant fill:#f5f5f5,stroke:#666
    style MinIO fill:#f5f5f5,stroke:#666
```

---

### 4. Chat Request Sequence Diagram
Show the SSE streaming flow from browser to LangGraph and back.

**Mermaid template:**
```mermaid
sequenceDiagram
    participant B as Browser
    participant FE as Frontend (React)
    participant API as FastAPI :8000
    participant LG as LangGraph Agent
    participant DB as MongoDB
    participant QD as Qdrant
    participant RR as Model Server (Reranker)
    participant LLM as LLM Provider

    B->>FE: Submit message
    FE->>API: POST /chat/stream (SSE)\n{query, session_id?}

    API->>DB: Resolve/create session (thread_id)
    API-->>FE: SSE: session_created

    API->>LG: graph.astream_events(input, config)

    LG->>LLM: input_safety check
    LLM-->>LG: safe/blocked

    alt safe
        LG->>LLM: intent_router classification
        LLM-->>LG: hr_query / greeting / general

        alt hr_query
            LG->>LLM: query_prepare (rewrite + filters)
            LG->>QD: hybrid search (dense + full-text RRF)
            QD-->>LG: top-K candidates
            LG->>RR: rerank via HTTP
            RR-->>LG: scored results
            LG->>LG: grade_documents

            alt score < 0.25 after retry
                LG-->>API: interrupt() HITL
                API-->>FE: SSE: clarification_needed
                FE-->>B: Show ClarificationPrompt
                B-->>FE: User types clarification
                FE->>API: POST /chat/resume
                API->>LG: Command(resume=response)
            end

            LG->>LLM: generate response
            LLM-->>LG: stream tokens
        end

        LG->>LLM: output_safety check
    end

    LG-->>API: node_end events (per node)
    API-->>FE: SSE: node_end (progress)
    API-->>FE: SSE: generation (final answer + sources)
    FE-->>B: Render answer

    API->>DB: Save session title (first exchange)
    API->>DB: Update message count
```

---

### 5. Authentication Flow

**Mermaid template:**
```mermaid
sequenceDiagram
    participant B as Browser
    participant FE as Frontend
    participant API as FastAPI
    participant DB as MongoDB

    B->>FE: Enter credentials
    FE->>API: POST /auth/login
    API->>DB: Verify user (bcrypt)
    DB-->>API: User record
    API-->>FE: {access_token (30m), refresh_token (7d)}
    FE->>FE: Store tokens (memory + localStorage)

    loop Every API call
        FE->>API: Request + Bearer access_token
        API->>API: Verify JWT signature
        API-->>FE: Response
    end

    Note over FE,API: On 401 (token expired)
    FE->>API: POST /auth/refresh\n{refresh_token}
    API->>DB: Validate refresh token
    API-->>FE: New access_token
    FE->>FE: Retry original request
```

---

### 6. Hybrid Search Internals

**Mermaid template:**
```mermaid
flowchart TD
    Query["User Query"] --> Dense & Sparse

    subgraph Qdrant Hybrid Search
        Dense["Dense Search\nnomic-embed-text\n768-dim cosine"] --> Prefetch1["Top-30 candidates"]
        Sparse["Full-text Search\nBM25 / SPLADE"] --> Prefetch2["Top-30 candidates"]
        Prefetch1 & Prefetch2 --> RRF["RRF Fusion\nk=40\nReciprocal Rank Fusion"]
        RRF --> LanguageBoost["Language Boost +10%\nsame-language docs"]
        LanguageBoost --> TopK["Top-15 results"]
    end

    TopK --> Reranker["Cross-encoder\njina-reranker-v2-base-multilingual\nmodel-server :8080"]
    Reranker --> Threshold{"score ≥ 0.25?"}
    Threshold -->|yes| ExpandContext["expand_context\nParent + neighbor chunks"]
    Threshold -->|no| Retry["rewrite_query / HITL"]
    ExpandContext --> Generate["generate node"]

    style Dense fill:#dae8fc,stroke:#6c8ebf
    style Sparse fill:#dae8fc,stroke:#6c8ebf
    style RRF fill:#fff2cc,stroke:#d6b656
    style Reranker fill:#e1d5e7,stroke:#9673a6
    style Threshold fill:#f8cecc,stroke:#b85450
```

---

## How to Use Each Format

### Mermaid (recommended for docs)
Paste into any `.md` file. Renders automatically on GitHub, GitLab, Notion, Obsidian.
- Wrap in ` ```mermaid ` ... ` ``` `
- Preview locally: `npx @mermaid-js/mermaid-cli -i diagram.mmd -o diagram.svg`

### draw.io XML
Use `/drawio-gen` skill to get importable `.drawio` XML files.
- Import: `draw.io → File → Import from → Device`
- VS Code: Install "Draw.io Integration" extension, open `.drawio` files directly

### ASCII Art (for terminals/READMEs)
```
[Browser] → [React:5173] → [FastAPI:8000] → [LangGraph Agent]
                                ↓                   ↓
                          [MongoDB:27017]      [Qdrant:6333]
                          [MinIO:9000]         [Redis:6379]
                          [ModelServer:8080]
```

## Output Instructions

1. Read the current codebase to verify the diagram matches actual implementation
2. Generate all 6 diagrams above updated to reflect the real code
3. Note any discrepancies between diagrams and actual code
4. Suggest which diagrams to add to `docs/` or embed in `README.md`
