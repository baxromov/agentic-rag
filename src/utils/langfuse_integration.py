"""Langfuse integration for LLM observability.

Reads configuration from MongoDB (admin-saved settings) with fallback to env vars.
"""

import os
import time

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
        os.environ["LANGFUSE_HOST"] = config["host"]
    if config.get("public_key"):
        os.environ["LANGFUSE_PUBLIC_KEY"] = config["public_key"]
    if config.get("secret_key"):
        os.environ["LANGFUSE_SECRET_KEY"] = config["secret_key"]


def _ensure_langfuse_client() -> bool:
    """Initialize the global Langfuse client singleton (required by v3 CallbackHandler)."""
    global _langfuse_client_initialized
    if _langfuse_client_initialized:
        return True

    try:
        import langfuse

        config = _get_langfuse_config()
        _apply_langfuse_env(config)

        langfuse.Langfuse()
        _langfuse_client_initialized = True
        return True
    except Exception as e:
        logger.warning("langfuse_client_init_failed", error=str(e))
        return False


def _is_langfuse_importable() -> bool:
    """Check whether Langfuse is enabled and the package is importable.

    Uses a TTL cache: on failure, retries after _RECHECK_INTERVAL seconds
    so a startup race (Langfuse not yet ready) self-heals.
    """
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
        from langfuse.langchain import CallbackHandler  # noqa: F401

        _langfuse_importable = True
        _langfuse_checked_at = now
        logger.info("langfuse_available", host=config["host"])
    except ImportError:
        _langfuse_importable = False
        _langfuse_checked_at = now
        logger.warning("langfuse_import_failed")

    return _langfuse_importable


def invalidate_langfuse_cache() -> None:
    """Force re-read of Langfuse config from MongoDB on next call.

    Call this after admin saves new Langfuse settings.
    """
    global _mongo_config, _langfuse_importable, _langfuse_client_initialized
    _mongo_config = None
    _langfuse_importable = None
    _langfuse_client_initialized = False


def get_langfuse_handler():
    """Create a fresh Langfuse CallbackHandler.

    Each handler instance starts a new trace, so call this once per
    graph run (not once per LLM call) to group all nodes under one trace.
    """
    if not _is_langfuse_importable():
        return None

    if not _ensure_langfuse_client():
        return None

    try:
        from langfuse.langchain import CallbackHandler

        handler = CallbackHandler()
        return handler
    except Exception as e:
        logger.warning("langfuse_handler_create_failed", error=str(e))
        return None


def get_langfuse_callbacks() -> list:
    """Return a fresh Langfuse callbacks list, or empty list if disabled."""
    handler = get_langfuse_handler()
    return [handler] if handler else []


def flush_langfuse_callbacks(callbacks: list) -> None:
    """Flush all Langfuse handlers in the callbacks list to ensure traces are sent."""
    for cb in callbacks:
        try:
            if hasattr(cb, "flush"):
                cb.flush()
        except Exception as e:
            logger.warning("langfuse_flush_failed", error=str(e))
