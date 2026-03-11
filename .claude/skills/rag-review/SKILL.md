---
name: rag-review
description: Review and optimize any RAG pipeline implementation. Analyzes chunking, embeddings, retrieval, reranking, generation, and evaluation. Works with LangGraph, LangChain, LlamaIndex, or custom pipelines.
---

# RAG Pipeline Review & Optimization

## Focus Area
$ARGUMENTS

## Review Checklist

### 1. Document Ingestion
- [ ] Format support (PDF, DOCX, HTML, Markdown, images)
- [ ] Parser selection (PyMuPDF vs Unstructured vs docling)
- [ ] OCR pipeline (Tesseract, PaddleOCR, vision models)
- [ ] Error handling for corrupt/unsupported files
- [ ] Metadata extraction (source, page, date, author)
- [ ] Language detection
- [ ] Deduplication strategy

### 2. Chunking Strategy
- [ ] Chunk size justified for use case (256-1024 tokens typical)
- [ ] Overlap configured (10-20% of chunk size)
- [ ] Splitter choice (recursive, semantic, document-aware, markdown)
- [ ] Metadata preserved per chunk (source, page, section)
- [ ] Parent-child relationships (for context expansion)
- [ ] Table/image handling (separate or inline)

### 3. Embedding
- [ ] Model selection justified (dimension, multilingual, speed)
  - Dense: OpenAI ada-002 (1536d), nomic-embed (768d), e5-large (1024d)
  - Sparse: BM25, SPLADE
  - Late interaction: ColBERT
- [ ] Batch processing (not one-by-one)
- [ ] Embedding cache (avoid re-computing)
- [ ] Dimension matches vector DB index
- [ ] Normalization (cosine vs dot product)

### 4. Vector Database
- [ ] Collection/index configuration
- [ ] Search type (dense, sparse, hybrid with RRF/DBSF)
- [ ] Distance metric (cosine, dot, euclidean)
- [ ] Filtering (metadata-based pre/post filtering)
- [ ] HNSW parameters tuned (ef, m for recall/speed trade-off)
- [ ] Payload indexing for full-text search
- [ ] Multi-tenancy isolation

### 5. Retrieval
- [ ] Top-K selection (too low = miss relevant, too high = noise)
- [ ] Hybrid search (dense + sparse scores combined)
- [ ] Score fusion method (RRF, weighted, linear)
- [ ] Query transformation (expansion, decomposition, HyDE)
- [ ] Multi-query retrieval (parallel queries for coverage)
- [ ] Contextual compression (extract relevant parts only)

### 6. Reranking
- [ ] Reranker model (cross-encoder, jina, Cohere, ColBERT)
- [ ] Score threshold (filter low-relevance after rerank)
- [ ] Latency budget (reranking adds 50-200ms typically)
- [ ] Batch size tuning
- [ ] Fallback if reranker fails

### 7. Generation
- [ ] Prompt template (system + context + question)
- [ ] Context window management (fit within model limits)
- [ ] Source citation in output (document + page/section)
- [ ] Streaming (SSE for real-time UI feedback)
- [ ] Temperature and sampling params justified
- [ ] Structured output (JSON mode for extracting data)
- [ ] Conversation memory (multi-turn context)

### 8. Guardrails
- [ ] Input safety (prompt injection, jailbreak detection)
- [ ] Output safety (PII, hallucination, toxic content)
- [ ] Content policy enforcement
- [ ] Fallback responses for blocked content

### 9. Evaluation & Observability
- [ ] Retrieval metrics (precision, recall, MRR, NDCG)
- [ ] Generation metrics (faithfulness, relevance, correctness)
- [ ] End-to-end latency tracking (TTFT, total time)
- [ ] Token usage tracking (cost estimation)
- [ ] Langfuse/LangSmith integration for tracing
- [ ] User feedback collection (thumbs up/down)
- [ ] A/B testing framework for pipeline changes

### 10. Production Readiness
- [ ] Error handling and retry logic
- [ ] Rate limiting (LLM API calls)
- [ ] Caching (query cache, semantic cache)
- [ ] Health checks
- [ ] Graceful degradation
- [ ] Monitoring alerts (latency, error rate, quality)
