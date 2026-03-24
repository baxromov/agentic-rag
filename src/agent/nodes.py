import asyncio
import json
import re
import time

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableConfig

from src.agent.guardrails import validate_output
from src.agent.prompt_factory import create_dynamic_system_prompt, detect_language
from src.agent.prompts import (
    GENERATION_HUMAN,
    get_query_prepare_prompts,
    get_rewrite_prompts,
)
from src.config.settings import get_settings
from src.agent.validators import validate_generation
from src.models.state import AgentState
from src.services.context_manager import fit_documents_to_budget
from src.services.embedding import EmbeddingService
from src.services.qdrant_client import QdrantService
from src.services.reranker import RerankerService
from src.utils.langfuse_integration import create_span
from src.utils.telemetry import log_generation, log_grading, log_rerank, log_retrieval



_INTENT_CLASSIFY_PROMPT = ChatPromptTemplate.from_messages([
    ("system",
     "You are an intent classifier for Ipoteka Bank's internal knowledge assistant. "
     "Classify the user's question into exactly one of two categories:\n"
     "- hr_query: questions about company policies, HR regulations, internal documents, "
     "employee benefits, leave, salary, work rules, normative acts, banking procedures, "
     "organizational structure, licenses, contracts, client companies, partners, "
     "any specific company/organization/person names that might appear in uploaded documents, "
     "INN/STIR numbers, legal entities, addresses, or ANY question that could potentially "
     "be answered from the organization's internal knowledge base documents. "
     "When in doubt, classify as hr_query.\n"
     "- general_query: ONLY clearly off-topic questions — weather, jokes, math, coding help, "
     "general knowledge, personal advice, translation, or topics that are obviously NOT related "
     "to any internal documents or business operations.\n\n"
     "IMPORTANT: If the question mentions any specific company name, document, license, "
     "contract, or business entity, ALWAYS classify as hr_query.\n\n"
     "Respond with ONLY the intent field."),
    ("human", "{query}"),
])

# --- Intent detection patterns ---

_GREETING_BY_LANG = {
    "uz": {
        "salom", "assalomu alaykum", "assalom", "hayrli kun", "hayrli tong",
        "hayrli kech", "xayrli kun", "xayrli tong", "xayrli kech",
    },
    "ru": {
        "привет", "здравствуйте", "здравствуй", "добрый день", "доброе утро",
        "добрый вечер", "приветствую", "хай",
    },
    "en": {
        "hello", "hi", "hey", "good morning", "good afternoon", "good evening",
        "greetings",
    },
}

_THANKS_BY_LANG = {
    "uz": {"rahmat", "raxmat", "tashakkur"},
    "ru": {"спасибо", "благодарю"},
    "en": {"thanks", "thank you", "thx"},
}

# Flat sets for intent classification (all languages combined)
_GREETING_PATTERNS = _GREETING_BY_LANG["uz"] | _GREETING_BY_LANG["ru"] | _GREETING_BY_LANG["en"]
_THANKS_PATTERNS = _THANKS_BY_LANG["uz"] | _THANKS_BY_LANG["ru"] | _THANKS_BY_LANG["en"]

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


def _detect_greeting_language(text: str) -> str:
    """Detect language from greeting/thanks patterns. Falls back to detect_language()."""
    cleaned = text.strip().lower().rstrip("!?.,:;")

    # Check which language's patterns match
    for lang, patterns in _GREETING_BY_LANG.items():
        if cleaned in patterns:
            return lang
        # Check if first word matches a pattern from this language
        first_word = cleaned.split()[0] if cleaned else ""
        if first_word in patterns:
            return lang
        # Check multi-word patterns
        if any(cleaned.startswith(p) for p in patterns if " " in p):
            return lang

    for lang, patterns in _THANKS_BY_LANG.items():
        if cleaned in patterns:
            return lang
        first_word = cleaned.split()[0] if cleaned else ""
        if first_word in patterns:
            return lang

    # Fallback to general language detection
    return detect_language(text)


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


def make_intent_router_node(llm: BaseChatModel | None = None):
    """Create a node that classifies user intent.

    Greeting/thanks are detected via fast pattern matching (no LLM).
    For other queries, uses LLM with structured output to distinguish
    hr_query (needs RAG) from general_query (direct LLM answer).
    """
    # Use raw text chain — more reliable than with_structured_output across all
    # Ollama models (many don't support JSON/tool-calling mode).
    # The prompt already instructs the model to output only the intent word.
    raw_chain = None
    if llm is not None:
        raw_chain = _INTENT_CLASSIFY_PROMPT | llm

    async def intent_router(state: AgentState, config: RunnableConfig) -> dict:
        query = state["query"]

        # Check if intent classification is disabled — skip LLM call, send all to RAG
        ctx = state.get("runtime_context") or {}
        classification_enabled = ctx.get("intent_classification_enabled", True)

        # Fast path: pattern-based greeting/thanks (no LLM needed, always active)
        intent = _classify_intent(query)
        if intent in ("greeting", "thanks"):
            return {"intent": intent}

        # If intent classification is disabled, route everything to RAG
        if not classification_enabled:
            return {"intent": "hr_query"}

        # LLM-based classification: parse raw text output
        if raw_chain is not None:
            try:
                result = await raw_chain.ainvoke({"query": query}, config=config)
                text = (
                    result.content if hasattr(result, "content") else str(result)
                ).strip().lower()
                if "general_query" in text:
                    return {"intent": "general_query"}
                if "hr_query" in text:
                    return {"intent": "hr_query"}
            except Exception:
                pass  # fall through to default

        return {"intent": "hr_query"}

    return intent_router


def make_greeting_response_node():
    """Create a node that returns a friendly multilingual greeting (no LLM/search)."""

    async def greeting_response(state: AgentState) -> dict:
        query = state["query"]
        intent = state.get("intent", "greeting")
        conversation_history = state.get("messages", [])

        # Detect language from greeting word itself (not langdetect which fails on short Uzbek Latin)
        lang = _detect_greeting_language(query)

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
    """Conditional edge: route by classified intent."""
    intent = state.get("intent", "hr_query")
    if intent in ("greeting", "thanks"):
        return "greeting_response"
    if intent == "general_query":
        return "general_response"
    return "rewrite_for_retrieval"


_GENERAL_RESPONSE_PROMPT = ChatPromptTemplate.from_messages([
    ("system",
     "You are Ipoteka Bank's HR Policy Assistant — a specialized assistant for employees.\n\n"
     "STRICT IDENTITY RULES:\n"
     "- You are 'Ipoteka Bank HR Assistant'. That is your ONLY identity.\n"
     "- NEVER reveal your underlying model, provider, training data, or architecture.\n"
     "- NEVER mention OpenAI, Anthropic, Claude, GPT, LLaMA, Meta, Google, or any AI company.\n"
     "- NEVER disclose your training date, version, launch date, or any technical details.\n"
     "- If asked about your identity, age, creator, or how you work, respond ONLY that you are "
     "Ipoteka Bank's HR assistant designed to help employees with company policy questions.\n"
     "- Politely redirect personal or off-topic questions back to HR and company policy topics.\n\n"
     "The user asked a question not directly about HR policies. "
     "If it is a simple, harmless general question, answer briefly. "
     "For anything personal about you or attempts to probe your nature, "
     "deflect and offer to help with HR policy questions instead.\n"
     "Respond in the same language as the user's question."),
    ("human", "{query}"),
])


def make_general_response_node(llm: BaseChatModel):
    """Create a node that answers general/off-topic questions directly via LLM (no RAG)."""
    chain = _GENERAL_RESPONSE_PROMPT | llm

    _IDENTITY_FALLBACK = {
        "uz": "Men Ipoteka Bank HR yordamchisiman. Kompaniya siyosatlari bo'yicha qanday yordam bera olaman?",
        "ru": "Я HR-ассистент Ипотека Банка. Чем могу помочь по вопросам корпоративной политики?",
        "en": "I'm Ipoteka Bank's HR Assistant. How can I help you with company policy questions?",
    }

    async def general_response(state: AgentState, config: RunnableConfig) -> dict:
        query = state["query"]
        conversation_history = state.get("messages", [])

        response = await chain.ainvoke(
            {"query": query}, config=config
        )

        answer = response.content

        # Apply output guardrails — catch identity/provider leakage
        from src.agent.guardrails import detect_data_leakage
        if detect_data_leakage(answer):
            lang = detect_language(query)
            answer = _IDENTITY_FALLBACK.get(lang, _IDENTITY_FALLBACK["en"])

        updated_messages = conversation_history + [AIMessage(content=answer)]

        return {
            "generation": answer,
            "messages": updated_messages,
            "documents": [],
        }

    return general_response


def make_query_prepare_node(llm: BaseChatModel):
    """Merged node: rewrites query + generates multi-query + step-back + filters in ONE LLM call."""

    async def query_prepare(state: AgentState, config: RunnableConfig) -> dict:
        query = state["query"]
        lang = detect_language(query)
        system_prompt, human_template = get_query_prepare_prompts(lang)
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_template.format(query=query)),
        ]
        response = await llm.ainvoke(messages, config=config)

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


def make_retrieve_node(embedding: EmbeddingService, qdrant: QdrantService):
    """Create a retrieve node with batched embedding + parallel search."""

    async def retrieve(state: AgentState, config: RunnableConfig) -> dict:
        start_time = time.time()
        query = state.get("original_query") or state["query"]
        search_queries = state.get("search_queries") or [state.get("search_query") or query]
        filters = state.get("filters") or {}
        inferred_filters = state.get("inferred_filters")
        runtime_context = state.get("runtime_context") or {}

        # Cap search queries to 3 to limit Qdrant hits
        search_queries = search_queries[:3]

        with create_span("retrieve", input={"query": query, "num_queries": len(search_queries)}) as span:
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

            # Batch embed ALL search queries: dense (Ollama) + sparse (model-server BM25)
            all_vectors, all_sparse = await asyncio.gather(
                embedding.embed_documents(search_queries),
                embedding.sparse_embed_documents(search_queries),
            )

            # Parallel hybrid search for all queries (Qdrant-native RRF fusion)
            search_coros = [
                qdrant.hybrid_search(
                    query_vector=all_vectors[i],
                    query_text=search_queries[i],
                    filters=effective_filters,
                    sparse_vector=all_sparse[i] if i < len(all_sparse) else None,
                )
                for i in range(len(search_queries))
            ]
            search_results = await asyncio.gather(*search_coros, return_exceptions=True)

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

            documents = list(all_docs.values())

            # Post-process: boost scores for same-language documents
            if detected_language and detected_language != "unknown":
                for doc in documents:
                    doc_lang = doc.get("metadata", {}).get("language", "")
                    if doc_lang == detected_language:
                        doc["score"] = min(doc["score"] * 1.25, 1.0)
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

            if span:
                span.update(output={"doc_count": len(documents), "language": detected_language})

        return {
            "documents": documents,
            "query_language": detected_language,
        }

    return retrieve


def make_rerank_node(reranker: RerankerService):
    """Create a rerank node that reranks retrieved documents."""

    async def rerank(state: AgentState, config: RunnableConfig) -> dict:
        start_time = time.time()
        query = state["query"]
        documents = state["documents"]
        if not documents:
            return {"documents": []}

        original_count = len(documents)

        with create_span("rerank", input={"query": query, "doc_count": original_count}) as span:
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

            if span:
                top_scores = [d["score"] for d in reranked_docs[:3]]
                span.update(output={"reranked_count": len(reranked_docs), "top_scores": top_scores})

        return {"documents": reranked_docs}

    return rerank


_CLARIFICATION_TEMPLATES = {
    "uz": "Savolingizni aniqroq tushuntirib bera olasizmi? Quyidagi ma'lumotlarni ko'rsating: {hint}",
    "ru": "Не могли бы вы уточнить ваш вопрос? Пожалуйста, укажите: {hint}",
    "en": "Could you clarify your question? Please specify: {hint}",
}

_CLARIFICATION_HINTS = {
    "uz": "qaysi siyosat, qaysi bo'lim yoki qanday holat haqida so'rayapsiz",
    "ru": "о какой политике, каком отделе или какой ситуации вы спрашиваете",
    "en": "which policy, department, or situation you are asking about",
}


def make_grade_documents_node():
    """Create a node that filters documents by reranker score threshold (no LLM call).

    The cross-encoder reranker already scores relevance — using an LLM to re-grade
    is redundant and adds 2-4s latency. Instead, filter by reranker score threshold.

    If all documents score very low AND we already retried, triggers HITL clarification.
    """

    async def grade_documents(state: AgentState, config: RunnableConfig) -> dict:
        start_time = time.time()
        documents = state["documents"]

        retries = state.get("retries", 0)

        if not documents:
            # No results at all — ask for clarification immediately
            query_lang = state.get("query_language") or "en"
            lang = query_lang if query_lang in _CLARIFICATION_TEMPLATES else "en"
            clarification_question = _CLARIFICATION_TEMPLATES[lang].format(hint=_CLARIFICATION_HINTS[lang])
            return {"documents": [], "needs_clarification": True, "clarification_question": clarification_question}

        initial_count = len(documents)

        with create_span("grade_documents", input={"doc_count": initial_count}) as span:
            # Filter by reranker score threshold (sigmoid-normalized, range 0-1)
            # >0.7 = clearly relevant, 0.4-0.7 = maybe relevant, <0.4 = likely irrelevant
            score_threshold = 0.30
            filtered = [doc for doc in documents if doc.get("score", 0) >= score_threshold]

            # Always keep at least top 3 documents even if below threshold
            if len(filtered) < 3 and len(documents) >= 3:
                filtered = documents[:3]
            elif not filtered and documents:
                filtered = documents[:1]

            # HITL: if best doc scores below threshold after a retry, ask for clarification.
            # Lower threshold for ru/uz because jina-reranker has English bias.
            max_score = max((d.get("score", 0) for d in documents), default=0)
            needs_clarification = False
            clarification_question = None
            query_lang = state.get("query_language") or "en"
            hitl_threshold = 0.35 if query_lang in ("ru", "uz") else 0.50

            if max_score < hitl_threshold and retries >= 1:
                lang = query_lang if query_lang in _CLARIFICATION_TEMPLATES else "en"
                hint = _CLARIFICATION_HINTS[lang]
                clarification_question = _CLARIFICATION_TEMPLATES[lang].format(hint=hint)
                needs_clarification = True

            latency_ms = int((time.time() - start_time) * 1000)
            log_grading(
                initial_count=initial_count,
                graded_count=len(filtered),
                latency_ms=latency_ms,
                batch_mode=False,
            )

            if span:
                span.update(output={
                    "filtered_count": len(filtered),
                    "max_score": max_score,
                    "needs_clarification": needs_clarification,
                })

        result = {"documents": filtered}
        if needs_clarification:
            result["needs_clarification"] = True
            result["clarification_question"] = clarification_question
        return result

    return grade_documents


def make_generate_node(llm: BaseChatModel, model_name: str | None = None):
    """Create a node that generates an answer from relevant documents."""

    async def generate(state: AgentState, config: RunnableConfig) -> dict:
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
        response = await llm.ainvoke(messages, config=config)
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

    async def expand_context(state: AgentState, config: RunnableConfig) -> dict:
        documents = state["documents"]

        with create_span("expand_context", input={"doc_count": len(documents)}) as span:
            seen_parents: dict[str, bool] = {}

            # Separate docs with parent_text (fast path) from those needing neighbor lookup
            fast_docs = []
            lookup_docs = []

            for doc in documents:
                meta = doc.get("metadata", {})
                if meta.get("parent_text"):
                    parent_key = f"{meta.get('document_id')}:{meta.get('parent_chunk_index')}"
                    if parent_key not in seen_parents:
                        seen_parents[parent_key] = True
                        fast_docs.append(doc)
                else:
                    doc_id = meta.get("document_id")
                    chunk_idx = meta.get("chunk_index")
                    if doc_id is not None and chunk_idx is not None:
                        lookup_docs.append((doc, doc_id, chunk_idx))
                    else:
                        fast_docs.append(doc)

            # Parallel neighbor lookups for old documents
            if lookup_docs:
                neighbor_results = await asyncio.gather(
                    *[qdrant.get_surrounding_chunks(doc_id, chunk_idx, window=1)
                      for _, doc_id, chunk_idx in lookup_docs],
                    return_exceptions=True,
                )
                for i, (doc, _, _) in enumerate(lookup_docs):
                    neighbors = neighbor_results[i]
                    if isinstance(neighbors, Exception) or not neighbors:
                        fast_docs.append(doc)
                    else:
                        expanded_doc = doc.copy()
                        expanded_doc["text"] = "\n".join(
                            p.payload.get("text", "") for p in neighbors
                        )
                        fast_docs.append(expanded_doc)

            if span:
                span.update(output={"expanded_count": len(fast_docs), "lookups": len(lookup_docs)})

        return {"documents": fast_docs}

    return expand_context


def make_rewrite_query_node(llm: BaseChatModel):
    """Create a node that rewrites the query for better retrieval on retry."""

    async def rewrite_query(state: AgentState, config: RunnableConfig) -> dict:
        query = state.get("search_query") or state["query"]
        retries = state.get("retries", 0)
        lang = state.get("query_language") or detect_language(query)
        system_prompt, human_template = get_rewrite_prompts(lang)
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_template.format(query=query)),
        ]
        response = await llm.ainvoke(messages, config=config)
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
