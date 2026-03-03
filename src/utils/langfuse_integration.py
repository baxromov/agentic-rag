"""Langfuse integration for unified LLM observability.

Creates ONE trace per graph execution. All LLM calls nest under this trace
via CallbackHandler. Non-LLM operations are tracked as child spans.

Uses Langfuse SDK v3 with Langfuse server v3 (OTEL-based).

Reads configuration from MongoDB (admin-saved settings) with fallback to env vars.
"""

import os
import time
from contextlib import contextmanager

from src.config.settings import get_settings
from src.utils.telemetry import logger

# Cache importability check with TTL so startup race conditions self-heal.
_langfuse_importable: bool | None = None
_langfuse_checked_at: float = 0.0
_langfuse_client_initialized: bool = False
_RECHECK_INTERVAL = 30.0  # seconds before retrying after failure

# MongoDB config cache
_mongo_config: dict | None = None
_mongo_config_checked_at: float = 0.0
_MONGO_CONFIG_TTL = 60.0  # re-read from MongoDB every 60 seconds


def _get_langfuse_config() -> dict:
    """Read Langfuse config from MongoDB (admin-saved), with TTL cache.

    Falls back to env vars / settings.py defaults if MongoDB is unavailable.
    """
    global _mongo_config, _mongo_config_checked_at

    now = time.monotonic()
    if _mongo_config is not None and (now - _mongo_config_checked_at) < _MONGO_CONFIG_TTL:
        return _mongo_config

    settings = get_settings()

    # Defaults from env vars
    config = {
        "enabled": settings.langfuse_enabled,
        "host": settings.langfuse_host,
        "public_key": settings.langfuse_public_key,
        "secret_key": settings.langfuse_secret_key,
    }

    # Try to read overrides from MongoDB (sync pymongo for compatibility)
    try:
        from pymongo import MongoClient

        client = MongoClient(settings.mongodb_url, serverSelectionTimeoutMS=2000)
        db = client.rag_auth
        saved = db.app_settings.find_one({"_id": "app_config"})
        client.close()

        if saved:
            if "langfuse_enabled" in saved:
                config["enabled"] = saved["langfuse_enabled"]
            if saved.get("langfuse_host"):
                config["host"] = saved["langfuse_host"]
            if saved.get("langfuse_public_key"):
                config["public_key"] = saved["langfuse_public_key"]
            if saved.get("langfuse_secret_key"):
                config["secret_key"] = saved["langfuse_secret_key"]
    except Exception as e:
        logger.debug("langfuse_mongo_read_failed", error=str(e))

    _mongo_config = config
    _mongo_config_checked_at = now
    return config


def _apply_langfuse_env(config: dict) -> None:
    """Set Langfuse env vars so the SDK picks them up automatically."""
    if config.get("host"):
        # SDK v3 uses LANGFUSE_BASE_URL (not LANGFUSE_HOST)
        os.environ["LANGFUSE_BASE_URL"] = config["host"]
        os.environ["LANGFUSE_HOST"] = config["host"]  # Keep for backward compat
    if config.get("public_key"):
        os.environ["LANGFUSE_PUBLIC_KEY"] = config["public_key"]
    if config.get("secret_key"):
        os.environ["LANGFUSE_SECRET_KEY"] = config["secret_key"]
    if config.get("enabled"):
        # Langfuse v3 SDK checks this to enable/disable OTEL tracing
        os.environ["LANGFUSE_TRACING_ENABLED"] = "true"
        # Remove OTEL_TRACES_EXPORTER=none if set (blocks the OTEL pipeline)
        if os.environ.get("OTEL_TRACES_EXPORTER", "").lower() == "none":
            del os.environ["OTEL_TRACES_EXPORTER"]
        # Set OTEL endpoint to Langfuse v3 server's OTEL ingestion URL
        host = config["host"].rstrip("/")
        os.environ.setdefault(
            "OTEL_EXPORTER_OTLP_ENDPOINT", f"{host}/api/public/otel"
        )


def _ensure_langfuse_env() -> bool:
    """Ensure Langfuse env vars are set so SDK auto-configures.

    Does NOT create any Langfuse() or get_client() instances to avoid
    the 'multiple clients' warning. CallbackHandler() will create the
    singleton client on first use.
    """
    global _langfuse_client_initialized
    if _langfuse_client_initialized:
        return True

    try:
        config = _get_langfuse_config()
        _apply_langfuse_env(config)
        _langfuse_client_initialized = True
        logger.info("langfuse_env_configured", host=config["host"])
        return True
    except Exception as e:
        logger.warning("langfuse_env_setup_failed", error=str(e))
        return False


def _is_langfuse_importable() -> bool:
    """Check whether Langfuse is enabled and the package is importable."""
    global _langfuse_importable, _langfuse_checked_at

    now = time.monotonic()
    if _langfuse_importable is True:
        return True
    if _langfuse_importable is False and (now - _langfuse_checked_at) < _RECHECK_INTERVAL:
        return False

    config = _get_langfuse_config()
    if not config["enabled"]:
        _langfuse_importable = False
        _langfuse_checked_at = now
        logger.info("langfuse_disabled")
        return False

    if not config.get("public_key") or not config.get("secret_key"):
        _langfuse_importable = False
        _langfuse_checked_at = now
        logger.info("langfuse_keys_not_configured")
        return False

    try:
        from langfuse import Langfuse  # noqa: F401

        _langfuse_importable = True
        _langfuse_checked_at = now
        logger.info("langfuse_available", host=config["host"])
    except ImportError:
        _langfuse_importable = False
        _langfuse_checked_at = now
        logger.warning("langfuse_import_failed")

    return _langfuse_importable


def invalidate_langfuse_cache() -> None:
    """Force re-read of Langfuse config from MongoDB on next call."""
    global _mongo_config, _langfuse_importable, _langfuse_client_initialized
    _mongo_config = None
    _langfuse_importable = None
    _langfuse_client_initialized = False


def create_langfuse_handler(
    trace_name: str = "rag-agent",
    session_id: str | None = None,
    user_id: str | None = None,
) -> tuple:
    """Create a Langfuse CallbackHandler with trace metadata.

    In SDK v3, session/user are passed via LangChain config metadata
    using special `langfuse_*` keys that the handler recognizes.

    Returns:
        (handler, metadata) — handler for config["callbacks"],
                              metadata for config["metadata"].
        (None, {}) if Langfuse is disabled.
    """
    if not _is_langfuse_importable() or not _ensure_langfuse_env():
        return None, {}

    try:
        from langfuse.langchain import CallbackHandler

        handler = CallbackHandler()
        metadata = {"langfuse_trace_name": trace_name}
        if session_id:
            metadata["langfuse_session_id"] = session_id
        if user_id:
            metadata["langfuse_user_id"] = user_id
        return handler, metadata
    except Exception as e:
        logger.warning("langfuse_handler_create_failed", error=str(e))
        return None, {}


def flush_langfuse():
    """Flush the Langfuse client to ensure all traces are sent."""
    try:
        from langfuse import get_client

        get_client().flush()
    except Exception as e:
        logger.debug("langfuse_flush_failed", error=str(e))


@contextmanager
def create_span(name: str, input: dict | None = None):
    """Create a Langfuse span for non-LLM operations (retrieve, rerank, etc.).

    Usage:
        with create_span("retrieve", input={"query": q}) as span:
            # ... do work ...
            if span:
                span.update(output={"doc_count": len(docs)})
    """
    if not _is_langfuse_importable() or not _ensure_langfuse_env():
        yield None
        return

    span = None
    try:
        from langfuse import get_client

        client = get_client()
        span = client.start_span(name=name, input=input or {})
    except Exception as e:
        logger.warning("langfuse_span_create_failed", error=str(e), span_name=name)

    try:
        yield span
    finally:
        if span is not None:
            try:
                span.end()
            except Exception as e:
                logger.debug("langfuse_span_end_failed", error=str(e), span_name=name)
