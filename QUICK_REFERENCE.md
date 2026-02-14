# Quick Reference Guide

## Common Operations

### Starting a Chat with Runtime Context

```python
# WebSocket message format
{
    "query": "How does photosynthesis work?",
    "filters": {"source": "biology.pdf"},
    "context": {
        "expertise_level": "beginner",  # or "intermediate", "expert", "general"
        "language_preference": "en",     # or "ru", "uz", "auto"
        "response_style": "detailed",    # or "concise", "balanced"
        "enable_citations": true
    }
}
```

### Multi-Turn Conversation

```python
# First message
{
    "query": "What is machine learning?",
    # No thread_id - will be created
}

# Follow-up message (same conversation)
{
    "query": "Can you give me an example?",
    "thread_id": "abc-123-def"  # Use thread_id from first response
}
```

### Checking Token Usage

Look for `context_metadata` in the response:
```json
{
    "answer": "...",
    "context_metadata": {
        "total_docs": 10,
        "included_docs": 7,
        "tokens_used": 5432,
        "tokens_available": 195000,
        "utilization": 2.8,
        "validation": {
            "confidence": 0.87,
            "has_citations": true,
            "validation_passed": true
        }
    }
}
```

### Understanding Confidence Scores

- **0.7-1.0**: High confidence - well-grounded in sources
- **0.5-0.7**: Moderate confidence - some source support
- **0.3-0.5**: Low confidence - limited source overlap
- **0.0-0.3**: Very low confidence - may be hallucinated

### Filtering Documents

```python
# By source
{"filters": {"source": "report.pdf"}}

# By language
{"filters": {"language": "en"}}

# By page number
{"filters": {"page_number": 5}}

# By page range
{"filters": {"page_number": {"gte": 3, "lte": 7}}}

# Multiple filters
{
    "filters": {
        "source": "report.pdf",
        "language": "en",
        "page_number": {"gte": 10}
    }
}
```

## Viewing Logs

### Development
Logs are printed to stdout as JSON:
```bash
docker-compose logs -f langgraph-server
```

### Production
Parse JSON logs with jq:
```bash
# View all generation events
docker-compose logs langgraph-server | jq 'select(.event == "generation_completed")'

# View high-latency requests
docker-compose logs langgraph-server | jq 'select(.latency_ms > 5000)'

# View low-confidence responses
docker-compose logs langgraph-server | jq 'select(.event == "generation_completed" and .confidence < 0.5)'

# View guardrail warnings
docker-compose logs langgraph-server | jq 'select(.has_warnings == true)'
```

## Debugging Common Issues

### Multi-Turn Conversations Not Working
**Symptom**: Agent doesn't remember previous conversation

**Check**:
1. Are you passing the same `thread_id` for follow-up messages?
2. Is the thread state loading correctly? Check logs for "websocket_request_received"
3. Are messages being appended? Check state in LangGraph Studio

### Context Overflow Errors
**Symptom**: Error about token limits

**Check**:
1. Look at `context_metadata.utilization` - should be <90%
2. Check `included_docs` vs `total_docs` - are docs being filtered?
3. Reduce `top_k` in filters to retrieve fewer documents
4. Documents might be too long - check chunking settings

### Low Confidence Responses
**Symptom**: `validation.confidence < 0.5`

**Causes**:
1. Retrieved documents don't match query well
2. Documents are in different language than query
3. Query is too vague or broad

**Solutions**:
1. Refine query to be more specific
2. Add filters to narrow document search
3. Check document quality in database
4. Review retrieval scores in logs

### Guardrail Violations
**Symptom**: "Security check failed" error

**Causes**:
1. Query too long (>2000 chars)
2. Prompt injection patterns detected
3. PII in query

**Solutions**:
1. Shorten query
2. Rephrase query naturally (avoid "ignore previous instructions")
3. Remove personal information from query

### Slow Response Times
**Symptom**: High `total_duration_ms`

**Check logs for**:
1. `retrieval_latency_ms` - Qdrant performance
2. `grading_latency_ms` - LLM grading speed
3. `generation_latency_ms` - Final generation speed

**Optimizations**:
1. Reduce `top_k` to retrieve fewer documents
2. Reduce `rerank_top_k` for faster reranking
3. Check if documents are being graded in batch (batch_mode: true)
4. Use faster LLM model for grading (e.g., Haiku instead of Sonnet)

## Environment Variables

### LLM Selection
```bash
# Use Claude
LLM_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-sonnet-4-20250514

# Use OpenAI
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o

# Use Ollama (local)
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_MODEL=llama3.1
```

### Performance Tuning
```bash
# Retrieval
RETRIEVAL_TOP_K=10          # Initial retrieval count
RETRIEVAL_PREFETCH_LIMIT=20 # RRF fusion prefetch
RERANK_TOP_K=5              # After reranking

# Chunking
CHUNK_SIZE=1000             # Characters per chunk
CHUNK_OVERLAP=200           # Overlap between chunks

# Retries
MAX_RETRIES=3               # Query rewrite attempts
```

## Model Context Windows

| Model | Context Window | Reserve for Output | Available for Input |
|-------|----------------|-------------------|---------------------|
| Claude Opus 4 | 200K | 4K | ~196K |
| Claude Sonnet 4 | 200K | 4K | ~196K |
| GPT-4o | 128K | 4K | ~124K |
| GPT-4o-mini | 128K | 4K | ~124K |
| Llama 3.1 | 128K | 4K | ~124K |
| GPT-4 | 8K | 4K | ~4K |

## Response Metadata Reference

### context_metadata
```json
{
    "total_docs": 10,           // Total docs retrieved
    "included_docs": 7,         // Docs that fit in context
    "tokens_used": 5432,        // Total tokens used
    "tokens_available": 195000, // Total available tokens
    "tokens_reserved": 1234,    // Reserved for query/prompt
    "utilization": 2.8,         // Percentage used
    "validation": {
        "confidence": 0.87,     // Response confidence (0-1)
        "has_citations": true,  // Citations present
        "is_generic": false,    // Generic non-answer
        "validation_passed": true,
        "warnings": []          // Validation/guardrail warnings
    }
}
```

### Documents
```json
{
    "text": "Document content...",
    "score": 0.95,              // Reranker score
    "retrieval_score": 0.82,    // Original Qdrant score
    "combined_score": 0.885,    // Average of both
    "grading_confidence": 0.9,  // Grading confidence
    "grading_reason": "Relevant",
    "language_match": true,     // Same language as query
    "metadata": {
        "source": "report.pdf",
        "page_number": 5,
        "language": "en"
    }
}
```

## Troubleshooting Checklist

- [ ] Check environment variables are set correctly
- [ ] Verify services are running: `docker-compose ps`
- [ ] Check Qdrant has documents: `curl http://localhost:6333/collections/documents`
- [ ] Review logs for errors: `docker-compose logs -f`
- [ ] Test with simple query first
- [ ] Verify thread_id for multi-turn conversations
- [ ] Check token usage if context overflow
- [ ] Review confidence scores for quality issues
- [ ] Check guardrail warnings if requests blocked
- [ ] Monitor latency metrics for performance issues

## Next Steps After Implementation

1. **Test the improvements**:
   - Test multi-turn conversations
   - Test with different expertise levels
   - Test multilingual queries (English, Russian, Uzbek)
   - Test with long documents to verify token management

2. **Monitor in production**:
   - Set up log aggregation (ELK, CloudWatch, etc.)
   - Create dashboards for key metrics
   - Set alerts for low confidence responses
   - Monitor token usage and costs

3. **Optimize based on metrics**:
   - Adjust confidence thresholds
   - Tune retrieval parameters (top_k, etc.)
   - Optimize chunk sizes
   - Fine-tune grading prompts

4. **Consider frontend development**:
   - Build chat UI to expose runtime context settings
   - Show confidence scores and token usage to users
   - Display source citations
   - Enable document filtering controls
