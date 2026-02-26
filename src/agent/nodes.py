import asyncio
import json
import re
import time

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from src.agent.guardrails import validate_output
from src.agent.prompt_factory import create_dynamic_system_prompt, detect_language
from src.agent.prompts import (
    GENERATION_HUMAN,
    GENERATION_SYSTEM,
    GRADING_HUMAN,
    GRADING_SYSTEM,
    QUERY_PREPARE_HUMAN,
    QUERY_PREPARE_SYSTEM,
    REWRITE_HUMAN,
    REWRITE_SYSTEM,
)
from src.config.settings import get_settings
from src.agent.validators import validate_generation
from src.models.state import AgentState
from src.services.context_manager import fit_documents_to_budget
from src.services.embedding import EmbeddingService
from src.services.qdrant_client import QdrantService
from src.services.reranker import RerankerService
from src.utils.telemetry import log_generation, log_grading, log_rerank, log_retrieval

# --- Intent detection patterns ---

_GREETING_PATTERNS = {
    # Uzbek
    "salom", "assalomu alaykum", "assalom", "hayrli kun", "hayrli tong",
    "hayrli kech", "xayrli kun", "xayrli tong", "xayrli kech",
    # Russian
    "привет", "здравствуйте", "здравствуй", "добрый день", "доброе утро",
    "добрый вечер", "приветствую", "хай",
    # English
    "hello", "hi", "hey", "good morning", "good afternoon", "good evening",
    "greetings",
}

_THANKS_PATTERNS = {
    "rahmat", "raxmat", "tashakkur",
    "спасибо", "благодарю",
    "thanks", "thank you", "thx",
}

_GREETING_RESPONSES = {
    "uz": "Assalomu alaykum! HR siyosatlari bo'yicha qanday yordam bera olaman?",
    "ru": "Здравствуйте! Чем могу помочь по вопросам HR политики?",
    "en": "Hello! How can I help you with HR policies?",
}

_THANKS_RESPONSES = {
    "uz": "Arzimaydi! Yana savollaringiz bo'lsa, bemalol murojaat qiling.",
    "ru": "Пожалуйста! Если у вас будут ещё вопросы, обращайтесь.",
    "en": "You're welcome! Feel free to ask if you have more questions.",
}

# Regex to detect emoji-only messages
_EMOJI_PATTERN = re.compile(
    r"^[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF"
    r"\U0001F1E0-\U0001F1FF\U00002702-\U000027B0\U0000FE00-\U0000FE0F"
    r"\U0001F900-\U0001F9FF\U0001FA00-\U0001FA6F\U0001FA70-\U0001FAFF"
    r"\U00002600-\U000026FF\U0000200D\U00002764\s]+$"
)


def _classify_intent(text: str) -> str:
    """Classify user message intent using pattern matching. No LLM call."""
    cleaned = text.strip().lower()
    # Remove trailing punctuation
    cleaned = cleaned.rstrip("!?.,:;")

    # Emoji-only messages → greeting
    if _EMOJI_PATTERN.match(text.strip()):
        return "greeting"

    # Empty after cleaning
    if not cleaned:
        return "greeting"

    # Exact match against greeting/thanks patterns
    if cleaned in _GREETING_PATTERNS:
        return "greeting"
    if cleaned in _THANKS_PATTERNS:
        return "thanks"

    # Short messages (≤3 words) that START with a greeting word but are ONLY greetings
    words = cleaned.split()
    if len(words) <= 3:
        first_word = words[0]
        if first_word in _GREETING_PATTERNS or any(cleaned.startswith(p) for p in _GREETING_PATTERNS if " " in p):
            # Make sure it's not a question disguised as a greeting
            # e.g., "salom, leave policy?" should NOT be a greeting
            if not any(c in cleaned for c in [",", "?"]) or len(words) <= 2:
                return "greeting"
        if first_word in _THANKS_PATTERNS or any(cleaned.startswith(p) for p in _THANKS_PATTERNS if " " in p):
            return "thanks"

    return "hr_query"


def make_intent_router_node():
    """Create a node that classifies user intent without LLM calls."""

    async def intent_router(state: AgentState) -> dict:
        query = state["query"]
        intent = _classify_intent(query)
        return {"intent": intent}

    return intent_router


def make_greeting_response_node():
    """Create a node that returns a friendly multilingual greeting (no LLM/search)."""

    async def greeting_response(state: AgentState) -> dict:
        query = state["query"]
        intent = state.get("intent", "greeting")
        conversation_history = state.get("messages", [])

        # Detect language for response
        lang = detect_language(query)

        # Pick response based on intent
        if intent == "thanks":
            response = _THANKS_RESPONSES.get(lang, _THANKS_RESPONSES["en"])
        else:
            response = _GREETING_RESPONSES.get(lang, _GREETING_RESPONSES["en"])

        updated_messages = conversation_history + [AIMessage(content=response)]

        return {
            "generation": response,
            "messages": updated_messages,
            "documents": [],
        }

    return greeting_response


def route_by_intent(state: AgentState) -> str:
    """Conditional edge: route greetings to greeting_response, else to RAG pipeline."""
    intent = state.get("intent", "hr_query")
    if intent in ("greeting", "thanks"):
        return "greeting_response"
    return "rewrite_for_retrieval"


def make_query_prepare_node(llm: BaseChatModel):
    """Merged node: rewrites query + generates multi-query + step-back + filters in ONE LLM call."""

    async def query_prepare(state: AgentState) -> dict:
        query = state["query"]
        messages = [
            SystemMessage(content=QUERY_PREPARE_SYSTEM),
            HumanMessage(content=QUERY_PREPARE_HUMAN.format(query=query)),
        ]
        response = await llm.ainvoke(messages)

        # Parse JSON response
        try:
            content = response.content.strip()
            # Remove markdown code blocks if present
            json_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", content, re.DOTALL)
            if json_match:
                json_str = json_match.group(1)
            else:
                json_match = re.search(r"\{.*\}", content, re.DOTALL)
                json_str = json_match.group(0) if json_match else content

            result = json.loads(json_str)

            search_query = result.get("search_query", query)
            search_queries = result.get("search_queries", [])
            step_back = result.get("step_back_query", "")
            inferred_filters = result.get("filters")

            # Combine: primary rewritten query + alternatives + step-back
            all_queries = [search_query]
            if search_queries:
                all_queries.extend(search_queries[:3])
            if step_back:
                all_queries.append(step_back)

            # Clean empty/null filters
            if inferred_filters:
                inferred_filters = {k: v for k, v in inferred_filters.items() if v}
                if not inferred_filters:
                    inferred_filters = None

            return {
                "original_query": query,
                "search_query": search_query,
                "search_queries": all_queries,
                "inferred_filters": inferred_filters,
            }
        except (json.JSONDecodeError, AttributeError) as e:
            print(f"Query prepare parsing error: {e}")
            return {
                "original_query": query,
                "search_query": query,
                "search_queries": [query],
                "inferred_filters": None,
            }

    return query_prepare


def make_retrieve_node(embedding: EmbeddingService, qdrant: QdrantService, llm: BaseChatModel = None):
    """Create a retrieve node with parallel multi-query embedding + search."""

    async def _embed_and_search(sq: str, merged_filters: dict | None) -> list[dict]:
        """Embed one query and run hybrid search — used as a parallel unit."""
        query_vector = await embedding.embed_query(sq)
        return await qdrant.hybrid_search(
            query_vector=query_vector,
            query_text=sq,
            filters=merged_filters,
        )

    async def retrieve(state: AgentState) -> dict:
        start_time = time.time()
        query = state.get("original_query") or state["query"]
        search_queries = state.get("search_queries") or [state.get("search_query") or query]
        filters = state.get("filters") or {}
        inferred_filters = state.get("inferred_filters")
        runtime_context = state.get("runtime_context") or {}
        settings = get_settings()

        # Detect query language (or use user preference)
        language_pref = runtime_context.get("language_preference", "auto")
        if language_pref == "auto":
            detected_language = detect_language(query)
        else:
            detected_language = language_pref

        # Merge user filters with inferred metadata filters
        merged_filters = {**filters}
        if inferred_filters:
            merged_filters.update(inferred_filters)
        effective_filters = merged_filters if merged_filters else None

        # Parallel multi-query retrieval: embed + search all queries concurrently
        search_results = await asyncio.gather(
            *[_embed_and_search(sq, effective_filters) for sq in search_queries],
            return_exceptions=True,
        )

        # Merge and deduplicate by point ID (keep highest score)
        all_docs: dict[str, dict] = {}
        for result in search_results:
            if isinstance(result, Exception):
                print(f"Search query error: {result}")
                continue
            for doc in result:
                doc_id = doc.get("id", "")
                if doc_id not in all_docs or doc["score"] > all_docs[doc_id]["score"]:
                    all_docs[doc_id] = doc

        # HyDE: generate hypothetical answer, embed it, search
        if llm and settings.enable_hyde:
            try:
                hyde_response = await llm.ainvoke([
                    HumanMessage(
                        content=(
                            f"Write one paragraph that would answer this HR policy question. "
                            f"Base it on typical corporate HR policies.\n\nQuestion: {query}"
                        )
                    )
                ])
                hyde_text = hyde_response.content.strip()
                hyde_docs = await _embed_and_search(hyde_text, effective_filters)
                for doc in hyde_docs:
                    doc_id = doc.get("id", "")
                    if doc_id not in all_docs or doc["score"] > all_docs[doc_id]["score"]:
                        all_docs[doc_id] = doc
            except Exception as e:
                print(f"HyDE retrieval error: {e}")

        documents = list(all_docs.values())

        # Post-process: boost scores for same-language documents
        if detected_language and detected_language != "unknown":
            for doc in documents:
                doc_lang = doc.get("metadata", {}).get("language", "")
                if doc_lang == detected_language:
                    doc["score"] = doc["score"] * 1.1
                    doc["language_match"] = True
                else:
                    doc["language_match"] = False

        # Sort by score
        documents.sort(key=lambda d: d["score"], reverse=True)

        # Log retrieval metrics
        latency_ms = int((time.time() - start_time) * 1000)
        log_retrieval(
            query=query,
            doc_count=len(documents),
            latency_ms=latency_ms,
            query_language=detected_language,
            filters=merged_filters if merged_filters else None,
        )

        return {
            "documents": documents,
            "query_language": detected_language,
        }

    return retrieve


def make_rerank_node(reranker: RerankerService):
    """Create a rerank node that reranks retrieved documents."""

    async def rerank(state: AgentState) -> dict:
        start_time = time.time()
        query = state["query"]
        documents = state["documents"]
        if not documents:
            return {"documents": []}

        original_count = len(documents)
        results = await reranker.rerank(query, documents)

        # Preserve BOTH original retrieval scores AND reranker scores
        reranked_docs = []
        for r in results:
            # Find original document to get its retrieval score
            original_score = documents[r.index]["score"] if r.index < len(documents) else 0.0

            reranked_docs.append({
                "text": r.text,
                "score": r.score,  # Reranker score (primary)
                "retrieval_score": original_score,  # Original Qdrant hybrid score
                "combined_score": (original_score + r.score) / 2,  # Average of both
                "metadata": r.metadata,
            })

        # Log reranking metrics
        latency_ms = int((time.time() - start_time) * 1000)
        log_rerank(
            original_count=original_count,
            reranked_count=len(reranked_docs),
            latency_ms=latency_ms,
        )

        return {"documents": reranked_docs}

    return rerank


def make_grade_documents_node(llm: BaseChatModel):
    """Create a node that grades document relevance using the LLM (batch mode)."""

    async def grade_documents(state: AgentState) -> dict:
        start_time = time.time()
        query = state["query"]
        documents = state["documents"]

        if not documents:
            return {"documents": []}

        initial_count = len(documents)

        # Format all documents for batch grading
        doc_list = []
        for i, doc in enumerate(documents):
            # Truncate very long documents for grading (first 500 chars)
            text_preview = doc["text"][:500] + ("..." if len(doc["text"]) > 500 else "")
            doc_list.append(f"[Doc {i}]: {text_preview}")

        documents_text = "\n\n".join(doc_list)

        # Single LLM call for all documents
        messages = [
            SystemMessage(content=GRADING_SYSTEM),
            HumanMessage(content=GRADING_HUMAN.format(query=query, documents=documents_text)),
        ]

        response = await llm.ainvoke(messages)

        # Parse JSON response
        try:
            # Extract JSON array from response (handle markdown code blocks)
            content = response.content.strip()
            # Remove markdown code blocks if present
            json_match = re.search(r"```(?:json)?\s*(\[.*?\])\s*```", content, re.DOTALL)
            if json_match:
                json_str = json_match.group(1)
            else:
                # Try to find JSON array directly
                json_match = re.search(r"\[.*\]", content, re.DOTALL)
                if json_match:
                    json_str = json_match.group(0)
                else:
                    # Fallback: assume whole content is JSON
                    json_str = content

            results = json.loads(json_str)

            # Filter documents by relevance and confidence threshold
            filtered = []
            confidence_threshold = 0.5

            for result in results:
                doc_id = result.get("doc_id", -1)
                is_relevant = result.get("relevant", False)
                confidence = result.get("confidence", 0.0)

                # Only include if relevant and confidence above threshold
                if is_relevant and confidence >= confidence_threshold and 0 <= doc_id < len(documents):
                    doc = documents[doc_id].copy()
                    # Add grading metadata
                    doc["grading_confidence"] = confidence
                    doc["grading_reason"] = result.get("reason", "")
                    filtered.append(doc)

            # Log grading metrics
            latency_ms = int((time.time() - start_time) * 1000)
            log_grading(
                initial_count=initial_count,
                graded_count=len(filtered),
                latency_ms=latency_ms,
                batch_mode=True,
            )

            return {"documents": filtered}

        except (json.JSONDecodeError, ValueError, KeyError) as e:
            # Fallback: if parsing fails, keep all documents
            # Log error in production
            print(f"Batch grading parsing error: {e}")
            latency_ms = int((time.time() - start_time) * 1000)
            log_grading(
                initial_count=initial_count,
                graded_count=initial_count,
                latency_ms=latency_ms,
                batch_mode=False,  # Failed to parse
            )
            return {"documents": documents}

    return grade_documents


def make_generate_node(llm: BaseChatModel, model_name: str | None = None):
    """Create a node that generates an answer from relevant documents."""

    async def generate(state: AgentState) -> dict:
        start_time = time.time()
        # Use original_query for generation (natural language), not the rewritten search query
        query = state.get("original_query") or state["query"]
        documents = state["documents"]
        conversation_history = state.get("messages", [])
        runtime_context = state.get("runtime_context") or {}

        # Get model name from LLM object or use provided one
        llm_model_name = model_name or getattr(llm, "model_name", None) or getattr(llm, "model", "gpt-4")

        # Create dynamic system prompt based on query, documents, and runtime context
        # This adapts to language, query type, expertise level, and document characteristics
        system_prompt = create_dynamic_system_prompt(
            query=query,
            documents=documents,
            runtime_context=runtime_context,
        )

        # Use smart context window management to fit documents
        context, context_metadata = fit_documents_to_budget(
            documents=documents,
            query=query,
            conversation_history=conversation_history,
            model_name=llm_model_name,
            system_prompt=system_prompt,
        )

        # Build messages with conversation history
        messages = [SystemMessage(content=system_prompt)]

        # Add previous conversation turns (exclude the current query which is already at the end)
        # The last message in conversation_history is the current HumanMessage
        if len(conversation_history) > 1:
            # Add previous turns but not the last one (current query)
            messages.extend(conversation_history[:-1])

        # Add current query with context
        current_prompt = GENERATION_HUMAN.format(context=context, query=query)
        messages.append(HumanMessage(content=current_prompt))

        # Generate response
        response = await llm.ainvoke(messages)
        answer = response.content

        # Validate response quality
        validation_result = validate_generation(
            response=answer, documents=documents, query=query
        )

        # Apply output guardrails (PII masking, data leakage check)
        # Note: using strict=False to allow low-confidence responses with warnings
        try:
            output_guardrails = validate_output(
                response=validation_result["generation"],
                validation_result=validation_result,
                strict=False,
            )
            final_answer = output_guardrails["response"]
            guardrail_warnings = output_guardrails.get("warnings", [])
        except Exception as e:
            # If guardrails fail, log error but continue with original response
            print(f"Output guardrail error: {e}")
            final_answer = validation_result["generation"]
            guardrail_warnings = [f"Guardrail error: {str(e)}"]

        # Update conversation history with AI response
        updated_messages = conversation_history + [AIMessage(content=final_answer)]

        # Merge context metadata with validation and guardrail metadata
        combined_metadata = {
            **(context_metadata or {}),
            "validation": {
                "confidence": validation_result["confidence"],
                "has_citations": validation_result["has_citations"],
                "is_generic": validation_result["is_generic"],
                "validation_passed": validation_result["validation_passed"],
                "warnings": validation_result.get("validation_warnings", []) + guardrail_warnings,
            },
        }

        # Log generation metrics
        latency_ms = int((time.time() - start_time) * 1000)
        tokens_used = context_metadata.get("tokens_used") if context_metadata else None
        all_warnings = validation_result.get("validation_warnings", []) + guardrail_warnings
        log_generation(
            query=query,
            doc_count=len(documents),
            latency_ms=latency_ms,
            tokens_used=tokens_used,
            confidence=validation_result["confidence"],
            validation_warnings=all_warnings if all_warnings else None,
        )

        return {
            "generation": final_answer,
            "messages": updated_messages,
            "context_metadata": combined_metadata,
        }

    return generate


def make_expand_context_node(qdrant: QdrantService):
    """Create a node that expands chunk context using parent text or neighbor lookup."""

    async def expand_context(state: AgentState) -> dict:
        documents = state["documents"]
        expanded = []
        seen_parents: dict[str, bool] = {}  # Deduplicate parent chunks

        for doc in documents:
            meta = doc.get("metadata", {})

            # If parent_text exists (new ingestion), deduplicate by parent
            if meta.get("parent_text"):
                parent_key = f"{meta.get('document_id')}:{meta.get('parent_chunk_index')}"
                if parent_key not in seen_parents:
                    seen_parents[parent_key] = True
                    expanded.append(doc)
                continue

            # Old documents without parent_text: expand by fetching neighbors
            doc_id = meta.get("document_id")
            chunk_idx = meta.get("chunk_index")
            if doc_id is not None and chunk_idx is not None:
                neighbors = await qdrant.get_surrounding_chunks(doc_id, chunk_idx, window=1)
                if neighbors:
                    merged_text = "\n".join(
                        p.payload.get("text", "") for p in neighbors
                    )
                    expanded_doc = doc.copy()
                    expanded_doc["text"] = merged_text
                    expanded.append(expanded_doc)
                else:
                    expanded.append(doc)
            else:
                expanded.append(doc)

        return {"documents": expanded}

    return expand_context


def make_rewrite_query_node(llm: BaseChatModel):
    """Create a node that rewrites the query for better retrieval on retry."""

    async def rewrite_query(state: AgentState) -> dict:
        query = state.get("search_query") or state["query"]
        retries = state.get("retries", 0)
        messages = [
            SystemMessage(content=REWRITE_SYSTEM),
            HumanMessage(content=REWRITE_HUMAN.format(query=query)),
        ]
        response = await llm.ainvoke(messages)
        rewritten = response.content.strip()
        return {
            "query": rewritten,
            "search_query": rewritten,
            "search_queries": [rewritten],  # Reset multi-query for retry
            "retries": retries + 1,
        }

    return rewrite_query


def should_retry(state: AgentState) -> str:
    """Decide whether to generate or retry retrieval."""
    if state["documents"]:
        return "generate"
    if state.get("retries", 0) >= 3:
        return "generate"  # Generate with whatever we have (possibly empty)
    return "rewrite"
