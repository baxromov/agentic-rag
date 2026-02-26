"""Dynamic prompt engineering based on context, language, and document characteristics."""
import re
from typing import Any

from langdetect import detect as _langdetect_detect
from langdetect import LangDetectException

_VALID_LANG_CODES = {"en", "ru", "uz"}

# langdetect maps: Turkish is often confused with Uzbek Latin
_LANG_MAP = {"tr": "uz"}


def detect_language(text: str) -> str:
    """
    Detect the language of the input text using langdetect with regex fallback.

    Returns:
        Language code: "en", "ru", "uz", or "unknown"
    """
    # For very short texts (<10 chars), langdetect is unreliable — use regex heuristic
    if len(text.strip()) < 10:
        return _detect_language_regex(text)

    try:
        code = _langdetect_detect(text)
        code = _LANG_MAP.get(code, code)
        if code in _VALID_LANG_CODES:
            return code
        # If langdetect returns an unsupported language, fall back to regex
        return _detect_language_regex(text)
    except LangDetectException:
        return _detect_language_regex(text)


def _detect_language_regex(text: str) -> str:
    """Regex-based fallback for short texts or when langdetect fails."""
    text_lower = text.lower()

    cyrillic_count = len(re.findall(r"[а-яё]", text_lower))
    latin_count = len(re.findall(r"[a-z]", text_lower))
    uzbek_chars = len(re.findall(r"[ўқғҳ]", text_lower))

    total_letters = cyrillic_count + latin_count + uzbek_chars
    if total_letters == 0:
        return "en"

    if uzbek_chars > 0:
        return "uz"

    if cyrillic_count > latin_count:
        return "ru"

    return "en"


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
        "en": "You are Ipoteka Bank's HR Policy Assistant. You help employees find answers about company policies, internal rules, and labor regulations.",
        "ru": "Вы HR-ассистент Ипотека Банка. Вы помогаете сотрудникам находить ответы о политиках компании, внутренних правилах и трудовом регулировании.",
        "uz": "Siz Ipoteka Bankning HR siyosat yordamchisisiz. Siz xodimlarga kompaniya siyosatlari, ichki qoidalar va mehnat qonunchiligi haqida javob topishda yordam berasiz.",
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
                "en": "You're analyzing company policy documents.",
                "ru": "Вы анализируете нормативные документы компании.",
                "uz": "Siz kompaniya normativ hujjatlarini tahlil qilyapsiz.",
            }
            prompt_parts.append(doc_instructions.get(detected_language, doc_instructions["en"]))

    # Detect if documents are in a different language than the query
    doc_languages = set()
    for doc in documents:
        doc_lang = doc.get("metadata", {}).get("language", "")
        if doc_lang:
            doc_languages.add(doc_lang)

    # Add cross-language instruction if documents are in a different language
    if doc_languages and detected_language not in doc_languages:
        cross_lang_instructions = {
            "en": f"The source documents are in {', '.join(doc_languages)}. Read them regardless of language, answer in English.",
            "ru": f"Исходные документы на {', '.join(doc_languages)} языке. Читайте их независимо от языка, отвечайте на русском.",
            "uz": f"Manba hujjatlari {', '.join(doc_languages)} tilida. Tilidan qat'i nazar o'qing, o'zbek tilida javob bering.",
        }
        prompt_parts.append(cross_lang_instructions.get(detected_language, cross_lang_instructions["en"]))

    # Grounding: use documents silently, answer from them only
    grounding_instructions = {
        "en": "Use the provided documents silently to produce the correct answer. Do NOT invent information. If the documents contain relevant information in ANY language, use it. Only say you could not find the information if there is genuinely NOTHING relevant.",
        "ru": "Используйте предоставленные документы скрыто для получения правильного ответа. НЕ выдумывайте информацию. Если документы содержат релевантную информацию на ЛЮБОМ языке, используйте её. Говорите что не нашли информацию только если в документах действительно НЕТ ничего релевантного.",
        "uz": "Taqdim etilgan hujjatlarni ichki ravishda to'g'ri javob berish uchun foydalaning. Ma'lumot to'qimang. Agar hujjatlarda ISTALGAN tilda tegishli ma'lumot bo'lsa, undan foydalaning. Faqat haqiqatan HECH NARSA tegishli bo'lmasa, topa olmadim deng.",
    }
    prompt_parts.append(grounding_instructions.get(detected_language, grounding_instructions["en"]))

    # Strict output rules
    output_rules = {
        "en": "STRICT RULES: Short, clear, professional — 2-5 sentences max. NEVER show sources, citations, page numbers, document names. NEVER write 'according to', 'as stated in', 'based on'. No introductions, no filler, no repetition. Only the final correct answer.",
        "ru": "СТРОГИЕ ПРАВИЛА: Кратко, ясно, профессионально — максимум 2-5 предложений. НИКОГДА не указывайте источники, цитаты, номера страниц, названия документов. НИКОГДА не пишите 'согласно документу', 'как указано в', 'на основании'. Без вступлений, без лишних слов, без повторений. Только итоговый правильный ответ.",
        "uz": "QATTIY QOIDALAR: Qisqa, aniq, professional — maksimum 2-5 gap. HECH QACHON manbalar, iqtiboslar, sahifa raqamlari, hujjat nomlari ko'rsatmang. HECH QACHON 'hujjatga ko'ra', 'aytilganidek' yozmang. Kirish so'zlarsiz, ortiqchasiz, takrorlarsiz. Faqat yakuniy to'g'ri javob.",
    }
    prompt_parts.append(output_rules.get(detected_language, output_rules["en"]))

    # Override with detailed style only if explicitly requested
    response_style = runtime_context.get("response_style", "balanced")
    if response_style == "detailed":
        style_instructions = {
            "en": "Provide comprehensive, detailed explanations.",
            "ru": "Предоставляйте всесторонние, подробные объяснения.",
            "uz": "Keng qamrovli, batafsil tushuntirishlar bering.",
        }
        prompt_parts.append(style_instructions.get(detected_language, style_instructions["en"]))

    return " ".join(prompt_parts)
