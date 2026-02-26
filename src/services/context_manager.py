"""Context window management for LLM token limits."""
from typing import Callable

from langchain_core.messages import BaseMessage


# Context window sizes for different models
CONTEXT_WINDOWS = {
    # Claude models
    "claude-opus-4": 200000,
    "claude-opus-4-6": 200000,
    "claude-sonnet-4": 200000,
    "claude-sonnet-4-5": 200000,
    "claude-sonnet-4-20250514": 200000,
    "claude-3-5-sonnet": 200000,
    "claude-3-opus": 200000,
    "claude-3-sonnet": 200000,
    "claude-3-haiku": 200000,
    # OpenAI models
    "gpt-4o": 128000,
    "gpt-4o-mini": 128000,
    "gpt-4-turbo": 128000,
    "gpt-4": 8192,
    "gpt-3.5-turbo": 16385,
    # Ollama/local models (conservative estimates)
    "llama3.1": 128000,
    "llama3.2": 128000,
    "mistral": 32000,
    "mixtral": 32000,
}


def get_context_budget(model_name: str, reserve_output: int = 4000) -> int:
    """
    Calculate available input tokens for a model.

    Args:
        model_name: Name of the LLM model
        reserve_output: Tokens to reserve for output (default 4000)

    Returns:
        Available tokens for input
    """
    # Match model name (handle partial matches)
    total_tokens = 8000  # Conservative default
    for model_key, window_size in CONTEXT_WINDOWS.items():
        if model_key in model_name.lower():
            total_tokens = window_size
            break

    return max(total_tokens - reserve_output, 1000)


def create_token_counter(model_name: str) -> Callable[[str], int]:
    """
    Create a token counting function for the given model.

    Args:
        model_name: Name of the LLM model

    Returns:
        Function that counts tokens in a string
    """
    # Try to use tiktoken for OpenAI models
    if "gpt" in model_name.lower():
        try:
            import tiktoken

            encoding = tiktoken.encoding_for_model(model_name)
            return lambda text: len(encoding.encode(text))
        except Exception:
            pass

    # Fallback: rough heuristic (1 token ≈ 4 characters for English)
    # For multilingual content, this is conservative
    def heuristic_counter(text: str) -> int:
        return max(len(text) // 4, 1)

    return heuristic_counter


def fit_documents_to_budget(
    documents: list[dict],
    query: str,
    conversation_history: list[BaseMessage],
    model_name: str,
    system_prompt: str = "",
) -> tuple[str, dict]:
    """
    Prioritize and truncate documents to fit within token budget.

    Args:
        documents: List of document dicts with 'text', 'score', 'metadata'
        query: User's current query
        conversation_history: Previous conversation messages
        model_name: LLM model name
        system_prompt: System prompt text

    Returns:
        Tuple of (formatted_context, metadata_dict)
    """
    tokenizer = create_token_counter(model_name)
    budget = get_context_budget(model_name)

    # Calculate tokens used by non-document content
    system_tokens = tokenizer(system_prompt) if system_prompt else 500
    query_tokens = tokenizer(query)

    # Estimate conversation history tokens
    history_tokens = sum(
        tokenizer(msg.content) if hasattr(msg, "content") else 0 for msg in conversation_history
    )

    # Reserve space for prompt template overhead (~200 tokens)
    template_overhead = 200

    # Calculate available tokens for documents
    reserved_tokens = system_tokens + query_tokens + history_tokens + template_overhead
    available_for_docs = max(budget - reserved_tokens, 1000)  # At least 1k for docs

    # Sort documents by score (highest first) to prioritize most relevant
    sorted_docs = sorted(documents, key=lambda d: d.get("score", 0), reverse=True)

    # Fit documents into budget
    context_parts = []
    used_tokens = 0
    included_docs = 0

    for doc in sorted_docs:
        # Format document with metadata
        page_info = ""
        meta = doc.get("metadata", {})
        if meta.get("page_number"):
            page_info = f" (page {meta['page_number']})"
        elif meta.get("page_start"):
            page_info = f" (pages {meta['page_start']}-{meta.get('page_end', '?')})"

        # Prefer parent_text (richer context) over child text for LLM generation
        doc_text = meta.get("parent_text") or doc.get("text", "")
        formatted_doc = f"[{included_docs + 1}]{page_info}: {doc_text}"

        doc_tokens = tokenizer(formatted_doc)

        # Check if document fits
        if used_tokens + doc_tokens <= available_for_docs:
            context_parts.append(formatted_doc)
            used_tokens += doc_tokens
            included_docs += 1
        else:
            # Try to fit a truncated version if this is an important doc
            if included_docs == 0:  # Always include at least one doc
                # Truncate to fit
                max_chars = available_for_docs * 4  # Rough conversion back to chars
                truncated_text = doc_text[:max_chars] + "..."
                formatted_doc = f"[{included_docs + 1}]{page_info}: {truncated_text}"
                context_parts.append(formatted_doc)
                used_tokens = tokenizer(formatted_doc)
                included_docs = 1
            break

    # Build final context
    context = "\n\n".join(context_parts)

    # Metadata for observability
    metadata = {
        "total_docs": len(documents),
        "included_docs": included_docs,
        "tokens_used": used_tokens + reserved_tokens,
        "tokens_available": budget,
        "tokens_reserved": reserved_tokens,
        "utilization": round((used_tokens + reserved_tokens) / budget * 100, 1),
    }

    return context, metadata
