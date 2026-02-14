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
    REWRITE_HUMAN,
    REWRITE_SYSTEM,
)
from src.agent.validators import validate_generation
from src.models.state import AgentState
from src.services.context_manager import fit_documents_to_budget
from src.services.embedding import EmbeddingService
from src.services.qdrant_client import QdrantService
from src.services.reranker import RerankerService
from src.utils.telemetry import log_generation, log_grading, log_rerank, log_retrieval


def make_retrieve_node(embedding: EmbeddingService, qdrant: QdrantService):
    """Create a retrieve node that performs hybrid search with language detection."""

    async def retrieve(state: AgentState) -> dict:
        start_time = time.time()
        query = state["query"]
        filters = state.get("filters") or {}
        runtime_context = state.get("runtime_context") or {}

        # Detect query language (or use user preference)
        language_pref = runtime_context.get("language_preference", "auto")
        if language_pref == "auto":
            detected_language = detect_language(query)
        else:
            detected_language = language_pref

        # First, try to retrieve documents preferring the detected language
        # This is a soft preference - we'll get mixed results if language-specific docs are few
        language_filters = filters.copy()

        # Perform hybrid search
        query_vector = await embedding.embed_query(query)
        documents = await qdrant.hybrid_search(
            query_vector=query_vector,
            query_text=query,
            filters=filters,  # Use original filters (no hard language constraint)
        )

        # Post-process: boost scores for same-language documents
        if detected_language and detected_language != "unknown":
            for doc in documents:
                doc_lang = doc.get("metadata", {}).get("language", "")
                if doc_lang == detected_language:
                    # Boost score by 10% for same-language documents
                    doc["score"] = doc["score"] * 1.1
                    doc["language_match"] = True
                else:
                    doc["language_match"] = False

            # Re-sort by boosted scores
            documents.sort(key=lambda d: d["score"], reverse=True)

        # Log retrieval metrics
        latency_ms = int((time.time() - start_time) * 1000)
        log_retrieval(
            query=query,
            doc_count=len(documents),
            latency_ms=latency_ms,
            query_language=detected_language,
            filters=filters if filters else None,
        )

        return {
            "documents": documents,
            "query_language": detected_language,  # Store for later use
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
            import json
            import re

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
        query = state["query"]
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


def make_rewrite_query_node(llm: BaseChatModel):
    """Create a node that rewrites the query for better retrieval."""

    async def rewrite_query(state: AgentState) -> dict:
        query = state["query"]
        retries = state.get("retries", 0)
        messages = [
            SystemMessage(content=REWRITE_SYSTEM),
            HumanMessage(content=REWRITE_HUMAN.format(query=query)),
        ]
        response = await llm.ainvoke(messages)
        return {"query": response.content.strip(), "retries": retries + 1}

    return rewrite_query


def should_retry(state: AgentState) -> str:
    """Decide whether to generate or retry retrieval."""
    if state["documents"]:
        return "generate"
    if state.get("retries", 0) >= 3:
        return "generate"  # Generate with whatever we have (possibly empty)
    return "rewrite"
