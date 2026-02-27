import anthropic
import httpx
from langchain_core.language_models.chat_models import BaseChatModel

from src.config.settings import LLMProvider, Settings


def create_llm(settings: Settings) -> BaseChatModel:
    """Factory that returns a LangChain chat model for the configured provider."""
    match settings.llm_provider:
        case LLMProvider.CLAUDE:
            from langchain_anthropic import ChatAnthropic

            chat = ChatAnthropic(
                model=settings.claude_model,
                api_key=settings.anthropic_api_key,
                max_tokens=4096,
            )
            # Patch underlying Anthropic clients to disable SSL verification
            # Required for corporate network with SSL inspection
            chat._async_client = anthropic.AsyncAnthropic(
                api_key=settings.anthropic_api_key,
                http_client=httpx.AsyncClient(verify=False),
            )
            chat._client = anthropic.Anthropic(
                api_key=settings.anthropic_api_key,
                http_client=httpx.Client(verify=False),
            )
            return chat
        case LLMProvider.OPENAI:
            from langchain_openai import ChatOpenAI

            return ChatOpenAI(
                model=settings.openai_model,
                api_key=settings.openai_api_key,
            )
        case LLMProvider.OLLAMA:
            from langchain_ollama import ChatOllama

            return ChatOllama(
                model=settings.ollama_model,
                base_url=settings.ollama_base_url,
                timeout=300,
            )
        case _:
            raise ValueError(f"Unknown LLM provider: {settings.llm_provider}")
