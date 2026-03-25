"""Direct graph execution with MongoDB persistence.

Uses MongoDBSaver from langgraph-checkpoint-mongodb (v0.3+) as the checkpointer.
MongoDB handles both session metadata and graph state. MongoDBSaver v0.3+ has
native async methods (aget/aput/etc.) via run_in_executor, and creates indexes
automatically in __init__ — no separate setup() call needed.
"""

from pymongo import MongoClient
from langgraph.checkpoint.mongodb import MongoDBSaver

from src.agent.graph import create_default_graph
from src.config.settings import get_settings

_client: MongoClient | None = None
_checkpointer: MongoDBSaver | None = None
_graph = None


async def init_graph_runner():
    """Initialize the graph runner with MongoDB persistence.

    Call this once during FastAPI lifespan startup.
    """
    global _client, _checkpointer, _graph

    settings = get_settings()

    _client = MongoClient(settings.mongodb_url)
    _checkpointer = MongoDBSaver(_client, db_name="langgraph")  # indexes created in __init__

    # Build graph with the persistent checkpointer
    _graph = await create_default_graph(checkpointer=_checkpointer)


async def close_graph_runner():
    """Close database connections. Call during FastAPI lifespan shutdown."""
    global _client
    if _client:
        _client.close()


def get_graph():
    """Get the compiled graph with MongoDB checkpointer."""
    if _graph is None:
        raise RuntimeError("Graph runner not initialized. Call init_graph_runner() first.")
    return _graph


def get_checkpointer() -> MongoDBSaver | None:
    """Get the MongoDBSaver checkpointer."""
    return _checkpointer
