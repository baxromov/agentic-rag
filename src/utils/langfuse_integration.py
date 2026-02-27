"""Langfuse integration for LLM observability."""

import httpx

from src.config.settings import get_settings
from src.utils.telemetry import logger


def get_langfuse_handler():
    """Create a Langfuse CallbackHandler with SSL verification disabled for corporate network."""
    settings = get_settings()
    if not settings.langfuse_enabled:
        return None

    try:
        from langfuse.callback import CallbackHandler

        handler = CallbackHandler(
            public_key=settings.langfuse_public_key,
            secret_key=settings.langfuse_secret_key,
            host=settings.langfuse_host,
            httpx_client=httpx.Client(verify=False, timeout=10.0),
        )
        return handler
    except Exception as e:
        logger.warning("langfuse_init_failed", error=str(e))
        return None


def get_langfuse_callbacks() -> list:
    """Return Langfuse callbacks list, or empty list if disabled."""
    handler = get_langfuse_handler()
    return [handler] if handler else []
