import re

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableConfig

from src.agent.guardrails import detect_data_leakage
from src.agent.prompt_factory import create_dynamic_system_prompt, detect_language
from src.agent.prompts import GENERATION_HUMAN
from src.models.state import AgentState
from src.services.qdrant_client import QdrantService


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

_EMOJI_PATTERN = re.compile(
    r"^[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF"
    r"\U0001F1E0-\U0001F1FF\U00002702-\U000027B0\U0000FE00-\U0000FE0F"
    r"\U0001F900-\U0001F9FF\U0001FA00-\U0001FA6F\U0001FA70-\U0001FAFF"
    r"\U00002600-\U000026FF\U0000200D\U00002764\s]+$"
)


def _detect_greeting_language(text: str) -> str:
    cleaned = text.strip().lower().rstrip("!?.,:;")
    for lang, patterns in _GREETING_BY_LANG.items():
        if cleaned in patterns:
            return lang
        first_word = cleaned.split()[0] if cleaned else ""
        if first_word in patterns:
            return lang
        if any(cleaned.startswith(p) for p in patterns if " " in p):
            return lang
    for lang, patterns in _THANKS_BY_LANG.items():
        if cleaned in patterns:
            return lang
        first_word = cleaned.split()[0] if cleaned else ""
        if first_word in patterns:
            return lang
    return detect_language(text)


def _classify_intent(text: str) -> str:
    cleaned = text.strip().lower().rstrip("!?.,:;")
    if _EMOJI_PATTERN.match(text.strip()):
        return "greeting"
    if not cleaned:
        return "greeting"
    if cleaned in _GREETING_PATTERNS:
        return "greeting"
    if cleaned in _THANKS_PATTERNS:
        return "thanks"
    words = cleaned.split()
    if len(words) <= 3:
        first_word = words[0]
        if first_word in _GREETING_PATTERNS or any(cleaned.startswith(p) for p in _GREETING_PATTERNS if " " in p):
            if not any(c in cleaned for c in [",", "?"]) or len(words) <= 2:
                return "greeting"
        if first_word in _THANKS_PATTERNS or any(cleaned.startswith(p) for p in _THANKS_PATTERNS if " " in p):
            return "thanks"
    return "hr_query"


def make_intent_router_node(llm: BaseChatModel | None = None):
    """Classify user intent: greeting/thanks via patterns, hr_query/general_query via LLM."""
    raw_chain = None
    if llm is not None:
        raw_chain = _INTENT_CLASSIFY_PROMPT | llm

    async def intent_router(state: AgentState, config: RunnableConfig) -> dict:
        query = state["query"]
        ctx = state.get("runtime_context") or {}
        classification_enabled = ctx.get("intent_classification_enabled", True)

        intent = _classify_intent(query)
        if intent in ("greeting", "thanks"):
            return {"intent": intent}

        if not classification_enabled:
            return {"intent": "hr_query"}

        if raw_chain is not None:
            try:
                result = await raw_chain.ainvoke({"query": query}, config=config)
                text = (result.content if hasattr(result, "content") else str(result)).strip().lower()
                if "general_query" in text:
                    return {"intent": "general_query"}
                if "hr_query" in text:
                    return {"intent": "hr_query"}
            except Exception:
                pass

        return {"intent": "hr_query"}

    return intent_router


def make_greeting_response_node():
    """Return a multilingual greeting/thanks response without LLM or search."""

    async def greeting_response(state: AgentState) -> dict:
        query = state["query"]
        intent = state.get("intent", "greeting")
        conversation_history = state.get("messages", [])
        lang = _detect_greeting_language(query)
        if intent == "thanks":
            response = _THANKS_RESPONSES.get(lang, _THANKS_RESPONSES["en"])
        else:
            response = _GREETING_RESPONSES.get(lang, _GREETING_RESPONSES["en"])
        updated_messages = conversation_history + [AIMessage(content=response)]
        return {"generation": response, "messages": updated_messages, "documents": []}

    return greeting_response


def route_by_intent(state: AgentState) -> str:
    """Conditional edge: route by classified intent."""
    intent = state.get("intent", "hr_query")
    if intent in ("greeting", "thanks"):
        return "greeting_response"
    if intent == "general_query":
        return "general_response"
    return "retrieve"


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
    """Answer general/off-topic questions directly via LLM (no RAG)."""
    chain = _GENERAL_RESPONSE_PROMPT | llm

    _IDENTITY_FALLBACK = {
        "uz": "Men Ipoteka Bank HR yordamchisiman. Kompaniya siyosatlari bo'yicha qanday yordam bera olaman?",
        "ru": "Я HR-ассистент Ипотека Банка. Чем могу помочь по вопросам корпоративной политики?",
        "en": "I'm Ipoteka Bank's HR Assistant. How can I help you with company policy questions?",
    }

    async def general_response(state: AgentState, config: RunnableConfig) -> dict:
        query = state["query"]
        conversation_history = state.get("messages", [])
        response = await chain.ainvoke({"query": query}, config=config)
        answer = response.content
        if detect_data_leakage(answer):
            lang = detect_language(query)
            answer = _IDENTITY_FALLBACK.get(lang, _IDENTITY_FALLBACK["en"])
        updated_messages = conversation_history + [AIMessage(content=answer)]
        return {"generation": answer, "messages": updated_messages, "documents": []}

    return general_response


def make_retrieve_node(qdrant: QdrantService):
    """Perform a single hybrid search and return results."""

    async def retrieve(state: AgentState, config: RunnableConfig) -> dict:
        query = state["query"]
        filters = state.get("filters") or None
        documents = await qdrant.hybrid_search(query=query, filters=filters)
        return {"documents": documents}

    return retrieve


def make_generate_node(llm: BaseChatModel):
    """Generate an answer from retrieved documents using the LLM."""

    async def generate(state: AgentState, config: RunnableConfig) -> dict:
        query = state["query"]
        documents = state["documents"]
        conversation_history = state.get("messages", [])
        runtime_context = state.get("runtime_context") or {}

        system_prompt = create_dynamic_system_prompt(
            query=query, documents=documents, runtime_context=runtime_context
        )
        context = "\n\n".join(doc.get("text", "") for doc in documents[:10])

        messages = [SystemMessage(content=system_prompt)]
        if len(conversation_history) > 1:
            messages.extend(conversation_history[:-1])
        messages.append(HumanMessage(content=GENERATION_HUMAN.format(context=context, query=query)))

        response = await llm.ainvoke(messages, config=config)
        answer = response.content
        updated_messages = conversation_history + [AIMessage(content=answer)]

        return {"generation": answer, "messages": updated_messages, "context_metadata": {}}

    return generate
