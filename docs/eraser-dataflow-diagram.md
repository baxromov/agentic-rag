# Eraser.io — Data Flow Diagram Prompt

> Copy the code block below and paste it into [eraser.io](https://app.eraser.io/) diagram editor.

```
// Agentic RAG Platform — Data Flow Diagrams

// ===== Flow 1: Document Upload =====

User [icon: user, label: "User"]
Browser [icon: browser, label: "Browser\nFrontend"]
API [icon: python, label: "FastAPI\nBackend"]
MinIO [icon: aws-s3, label: "MinIO\nFile Storage"]
Parser [icon: file, label: "Document Parser\nUnstructured + OCR"]
Chunker [icon: scissors, label: "Chunker\n500 chars, overlap 100"]
LangDetect [icon: globe, label: "Language Detection\nLLM-based\nuz / ru / en"]
Embedder [icon: cpu, label: "Ollama\nnomic-embed-text\n768-dim"]
VectorDB [icon: search, label: "Qdrant\nVector DB"]

User --> Browser: Upload PDF/DOCX/XLSX
Browser --> API: POST /documents/upload\nmultipart/form-data
API --> MinIO: Save original file\nSHA256 hash
API --> Parser: Extract text\nTesseract OCR + LibreOffice
Parser --> Chunker: Raw text
Chunker --> LangDetect: Text chunks
LangDetect --> Embedder: Chunks + language
Embedder --> VectorDB: Vectors + metadata\n(doc_id, page, language, chunk_index)

// ===== Flow 2: Chat (RAG Agent) =====

User2 [icon: user, label: "User"]
Browser2 [icon: browser, label: "Browser\nFrontend"]
API2 [icon: python, label: "FastAPI"]
InputGuard [icon: shield, label: "Input Safety\nGuardrail (LLM)"]
Router [icon: signpost, label: "Intent Router\nPattern + LLM"]
QueryPrep [icon: edit, label: "Query Prepare\nRewrite + Multi-query"]
Retriever [icon: search, label: "Retrieve\nQdrant Hybrid\nDense + Full-text (RRF)"]
Reranker [icon: sort, label: "Rerank\nJina Reranker\nModel Server"]
Grader [icon: check, label: "Grade Documents\nScore threshold"]
HITL [icon: hand, label: "Human Feedback\ninterrupt() — HITL"]
Expander [icon: expand, label: "Expand Context\nParent + neighbor chunks"]
Generator [icon: brain, label: "Generate\nLLM Response"]
OutputGuard [icon: shield, label: "Output Safety\nGuardrail (LLM)"]
MongoDB2 [icon: mongodb, label: "MongoDB\nSessions"]
PG [icon: postgres, label: "PostgreSQL\nCheckpoints"]

User2 --> Browser2: Ask question
Browser2 --> API2: POST /chat/stream\nSSE connection
API2 --> MongoDB2: Create/load session
API2 --> InputGuard: Check query safety
InputGuard --> Router: Safe query
Router --> QueryPrep: hr_query intent
QueryPrep --> Retriever: Rewritten queries
Retriever --> Reranker: Top-30 candidates
Reranker --> Grader: Top-7 reranked docs
Grader --> Expander: Good docs (score ≥ 0.25)
Grader --> QueryPrep: Bad docs → rewrite (max 3 retries) [style: dashed]
Grader --> HITL: All scores < 0.25 after retry [style: dashed]
HITL --> Browser2: SSE: clarification_needed [style: dashed]
Browser2 --> API2: POST /chat/resume [style: dashed]
Expander --> Generator: Expanded context
Generator --> OutputGuard: Draft response
OutputGuard --> API2: Safe response
API2 --> Browser2: SSE: generation\n(answer + sources)
API2 --> PG: Save checkpoint

// Greeting/General paths
Router --> Generator: greeting → template response [style: dotted]
Router --> Generator: general_query → direct LLM [style: dotted]

// ===== Flow 3: Feedback =====

User3 [icon: user, label: "User"]
Browser3 [icon: browser, label: "Browser"]
API3 [icon: python, label: "FastAPI"]
MongoDB3 [icon: mongodb, label: "MongoDB\nmessage_feedback"]

User3 --> Browser3: Thumbs up/down + note
Browser3 --> API3: POST /feedback
API3 --> MongoDB3: Save feedback\n(thread_id + message_index)
```
