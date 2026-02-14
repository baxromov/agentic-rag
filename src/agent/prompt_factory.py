"""Dynamic prompt engineering based on context, language, and document characteristics."""
import re
from typing import Any


def detect_language(text: str) -> str:
    """
    Detect the language of the input text using simple heuristics.

    Args:
        text: Input text to analyze

    Returns:
        Language code: "en", "ru", "uz", or "unknown"
    """
    text_lower = text.lower()

    # Cyrillic characters indicate Russian or Uzbek
    cyrillic_count = len(re.findall(r"[а-яё]", text_lower))

    # Latin characters
    latin_count = len(re.findall(r"[a-z]", text_lower))

    # Uzbek-specific characters
    uzbek_chars = len(re.findall(r"[ўқғҳ]", text_lower))

    total_letters = cyrillic_count + latin_count + uzbek_chars

    if total_letters == 0:
        return "en"  # Default

    # Uzbek has specific characters
    if uzbek_chars > 0:
        return "uz"

    # More Cyrillic than Latin = Russian
    if cyrillic_count > latin_count:
        return "ru"

    # More Latin = English
    if latin_count > cyrillic_count:
        return "en"

    return "en"  # Default


def detect_query_type(query: str) -> str:
    """
    Detect the type of query to adapt the response format.

    Args:
        query: User's query

    Returns:
        Query type: "definition", "comparison", "how_to", "list", "factual", "analytical"
    """
    query_lower = query.lower()

    # Definition questions
    if any(
        pattern in query_lower
        for pattern in ["what is", "what are", "define", "meaning of", "explain"]
    ):
        return "definition"

    # Comparison questions
    if any(
        pattern in query_lower
        for pattern in [
            "compare",
            "difference between",
            "vs",
            "versus",
            "better than",
            "worse than",
        ]
    ):
        return "comparison"

    # How-to questions
    if any(pattern in query_lower for pattern in ["how to", "how do", "how can", "steps to"]):
        return "how_to"

    # List questions
    if any(
        pattern in query_lower
        for pattern in ["list", "what are the", "enumerate", "give me all"]
    ):
        return "list"

    # Analytical questions
    if any(pattern in query_lower for pattern in ["why", "analyze", "explain why", "reason"]):
        return "analytical"

    # Factual (default)
    return "factual"


def get_language_specific_instructions(language: str, query_type: str) -> str:
    """
    Get language-specific instructions for the prompt.

    Args:
        language: Detected language code
        query_type: Type of query

    Returns:
        Language-specific instructions
    """
    instructions = {
        "en": {
            "definition": "Provide a clear, concise definition followed by relevant details.",
            "comparison": "Present a balanced comparison with key differences and similarities.",
            "how_to": "Provide step-by-step instructions in a numbered list format.",
            "list": "Present the information as a bulleted or numbered list.",
            "analytical": "Provide a detailed analysis with supporting evidence from the sources.",
            "factual": "Provide accurate, factual information directly answering the question.",
        },
        "ru": {
            "definition": "Дайте четкое, краткое определение с последующими деталями.",
            "comparison": "Представьте сбалансированное сравнение с ключевыми различиями и сходствами.",
            "how_to": "Предоставьте пошаговые инструкции в виде нумерованного списка.",
            "list": "Представьте информацию в виде маркированного или нумерованного списка.",
            "analytical": "Предоставьте детальный анализ с подтверждающими доказательствами из источников.",
            "factual": "Предоставьте точную, фактическую информацию, непосредственно отвечающую на вопрос.",
        },
        "uz": {
            "definition": "Aniq, qisqa ta'rif bering va keyin tafsilotlarni qo'shing.",
            "comparison": "Asosiy farqlar va o'xshashliklar bilan muvozanatli taqqoslash bering.",
            "how_to": "Raqamlangan ro'yxat shaklida qadam-baqadam ko'rsatmalar bering.",
            "list": "Ma'lumotni belgilangan yoki raqamlangan ro'yxat sifatida taqdim eting.",
            "analytical": "Manbalardan dalillar bilan batafsil tahlil bering.",
            "factual": "Savolga to'g'ridan-to'g'ri javob beradigan aniq, haqiqiy ma'lumot bering.",
        },
    }

    return instructions.get(language, instructions["en"]).get(query_type, instructions["en"]["factual"])


def detect_document_types(documents: list[dict]) -> dict[str, int]:
    """
    Detect types of source documents.

    Args:
        documents: List of document dictionaries

    Returns:
        Dictionary mapping document types to counts
    """
    type_counts = {}

    for doc in documents:
        metadata = doc.get("metadata", {})
        source = metadata.get("source", "")

        # Extract file extension
        if "." in source:
            ext = source.split(".")[-1].lower()
            type_counts[ext] = type_counts.get(ext, 0) + 1
        else:
            type_counts["unknown"] = type_counts.get("unknown", 0) + 1

    return type_counts


def create_dynamic_system_prompt(
    query: str,
    documents: list[dict],
    runtime_context: dict[str, Any],
) -> str:
    """
    Create a dynamic system prompt based on query, documents, and runtime context.

    This extends the basic runtime context adaptation with:
    - Language detection and localization
    - Query type detection for format adaptation
    - Document type-specific instructions

    Args:
        query: User's query
        documents: Retrieved documents
        runtime_context: User-specific runtime configuration

    Returns:
        Fully adapted system prompt
    """
    # Detect language (override if user specified preference)
    language_pref = runtime_context.get("language_preference", "auto")
    if language_pref == "auto":
        detected_language = detect_language(query)
    else:
        detected_language = language_pref

    # Detect query type
    query_type = detect_query_type(query)

    # Detect document types
    doc_types = detect_document_types(documents)

    # Build base prompt based on language
    base_prompts = {
        "en": "You are a helpful multilingual assistant.",
        "ru": "Вы полезный многоязычный помощник.",
        "uz": "Siz foydali ko'p tilli yordamchisiz.",
    }

    prompt_parts = [base_prompts.get(detected_language, base_prompts["en"])]

    # Add expertise-level specific instructions
    expertise_level = runtime_context.get("expertise_level", "general")
    if expertise_level == "expert":
        expertise_instructions = {
            "en": "Provide technical, detailed responses with domain-specific terminology.",
            "ru": "Предоставляйте технические, подробные ответы со специализированной терминологией.",
            "uz": "Texnik, batafsil javoblar bering va maxsus terminologiyadan foydalaning.",
        }
        prompt_parts.append(expertise_instructions.get(detected_language, expertise_instructions["en"]))
    elif expertise_level == "beginner":
        beginner_instructions = {
            "en": "Explain simply, avoid jargon, and use clear examples.",
            "ru": "Объясняйте просто, избегайте жаргона и используйте понятные примеры.",
            "uz": "Sodda tushuntiring, murakkab atamalardan qoching va aniq misollar keltiring.",
        }
        prompt_parts.append(beginner_instructions.get(detected_language, beginner_instructions["en"]))

    # Add query type-specific instructions
    type_instruction = get_language_specific_instructions(detected_language, query_type)
    prompt_parts.append(type_instruction)

    # Add document type-specific instructions
    if doc_types:
        dominant_type = max(doc_types.items(), key=lambda x: x[1])[0]
        if dominant_type == "pdf" and doc_types.get("pdf", 0) == len(documents):
            doc_instructions = {
                "en": "You're analyzing research documents. Provide precise citations with page numbers.",
                "ru": "Вы анализируете исследовательские документы. Указывайте точные ссылки с номерами страниц.",
                "uz": "Siz tadqiqot hujjatlarini tahlil qilyapsiz. Sahifa raqamlari bilan aniq havolalar bering.",
            }
            prompt_parts.append(doc_instructions.get(detected_language, doc_instructions["en"]))

    # Add grounding instruction
    grounding_instructions = {
        "en": "Answer based ONLY on the provided context documents. If the context doesn't contain enough information, say so.",
        "ru": "Отвечайте ТОЛЬКО на основе предоставленных контекстных документов. Если контекста недостаточно, укажите это.",
        "uz": "FAQAT taqdim etilgan kontekst hujjatlari asosida javob bering. Agar kontekst yetarli bo'lmasa, buni ayting.",
    }
    prompt_parts.append(grounding_instructions.get(detected_language, grounding_instructions["en"]))

    # Add citation instruction if enabled
    enable_citations = runtime_context.get("enable_citations", True)
    if enable_citations:
        citation_instructions = {
            "en": "Include page references when available (e.g., 'according to page 3...').",
            "ru": "Включайте ссылки на страницы, когда доступны (например, 'согласно странице 3...').",
            "uz": "Sahifa havolalarini qo'shing (masalan, '3-sahifaga ko'ra...').",
        }
        prompt_parts.append(citation_instructions.get(detected_language, citation_instructions["en"]))

    # Add response style instruction
    response_style = runtime_context.get("response_style", "balanced")
    if response_style == "concise":
        style_instructions = {
            "en": "Keep responses brief and to the point.",
            "ru": "Давайте краткие и точные ответы.",
            "uz": "Javoblarni qisqa va aniq bering.",
        }
        prompt_parts.append(style_instructions.get(detected_language, style_instructions["en"]))
    elif response_style == "detailed":
        style_instructions = {
            "en": "Provide comprehensive, detailed explanations.",
            "ru": "Предоставляйте всесторонние, подробные объяснения.",
            "uz": "Keng qamrovli, batafsil tushuntirishlar bering.",
        }
        prompt_parts.append(style_instructions.get(detected_language, style_instructions["en"]))

    return " ".join(prompt_parts)
