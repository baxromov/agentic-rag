"""Direct graph execution with MongoDB persistence.

Uses AsyncMongoDBSaver from langgraph-checkpoint-mongodb as the checkpointer,
so PostgreSQL is no longer needed — MongoDB handles both session metadata
and graph state. AsyncMongoDBSaver works with motor (async MongoDB driver)
and is compatible with both Linux/Mac and Windows asyncio event loops.
"""

from motor.motor_asyncio import AsyncIOMotorClient
from langgraph.checkpoint.mongodb.aio import AsyncMongoDBSaver

from src.agent.graph import create_default_graph
from src.config.settings import get_settings

_client: AsyncIOMotorClient | None = None
_checkpointer: AsyncMongoDBSaver | None = None
_graph = None


async def init_graph_runner():
    """Initialize the graph runner with MongoDB persistence.

    Call this once during FastAPI lifespan startup.
    """
    global _client, _checkpointer, _graph

    settings = get_settings()

    # Async MongoDB client (motor) — works on all platforms including Windows
    _client = AsyncIOMotorClient(settings.mongodb_url)
    _checkpointer = AsyncMongoDBSaver(_client, db_name="langgraph")
    await _checkpointer.asetup()  # Creates required MongoDB indexes

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


def get_checkpointer() -> AsyncMongoDBSaver | None:
    """Get the AsyncMongoDBSaver checkpointer."""
    return _checkpointer
