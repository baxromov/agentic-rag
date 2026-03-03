"""Direct graph execution with PostgreSQL persistence.

Replaces the langgraph-server (which uses in-memory storage in dev mode)
with a direct graph invocation using AsyncPostgresSaver for persistent
chat history that survives service restarts.
"""

import psycopg
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg_pool import AsyncConnectionPool

from src.agent.graph import create_default_graph
from src.config.settings import get_settings

_pool: AsyncConnectionPool | None = None
_checkpointer: AsyncPostgresSaver | None = None
_graph = None


async def init_graph_runner():
    """Initialize the graph runner with PostgreSQL persistence.

    Call this once during FastAPI lifespan startup.
    """
    global _pool, _checkpointer, _graph

    settings = get_settings()

    # Create async connection pool for PostgreSQL
    _pool = AsyncConnectionPool(
        conninfo=settings.postgres_url,
        min_size=2,
        max_size=10,
        open=False,
    )
    await _pool.open()

    # Create checkpointer and set up schema.
    # Use a separate autocommit connection for setup because
    # migrations may use CREATE INDEX CONCURRENTLY which cannot
    # run inside a transaction block.
    _checkpointer = AsyncPostgresSaver(_pool)
    async with await psycopg.AsyncConnection.connect(
        settings.postgres_url, autocommit=True
    ) as conn:
        await AsyncPostgresSaver(conn).setup()

    # Build graph with the persistent checkpointer
    _graph = await create_default_graph(checkpointer=_checkpointer)


async def close_graph_runner():
    """Close database connections. Call during FastAPI lifespan shutdown."""
    global _pool
    if _pool:
        await _pool.close()


def get_graph():
    """Get the compiled graph with PostgreSQL checkpointer."""
    if _graph is None:
        raise RuntimeError("Graph runner not initialized. Call init_graph_runner() first.")
    return _graph


def get_checkpointer():
    """Get the AsyncPostgresSaver checkpointer."""
    return _checkpointer
