"""MongoDB-based session metadata store.

Stores session metadata (title, user_id, message_count) in MongoDB
for persistence. Message content is stored in PostgreSQL via the
LangGraph checkpointer (thread state).
"""

import uuid
from datetime import datetime, timezone

from src.services.mongodb import get_mongodb


async def ensure_indexes():
    """Create indexes for the chat_sessions collection."""
    db = await get_mongodb()
    await db.chat_sessions.create_index("thread_id", unique=True)
    await db.chat_sessions.create_index("user_id")


async def create_session(user_id: str, title: str = "New Chat") -> dict:
    """Create a new chat session."""
    db = await get_mongodb()
    now = datetime.now(timezone.utc)
    session = {
        "thread_id": str(uuid.uuid4()),
        "user_id": user_id,
        "title": title,
        "message_count": 0,
        "created_at": now,
        "updated_at": now,
    }
    await db.chat_sessions.insert_one(session)
    return session


async def get_session(thread_id: str) -> dict | None:
    """Get a session by thread_id."""
    db = await get_mongodb()
    return await db.chat_sessions.find_one({"thread_id": thread_id}, {"_id": 0})


async def list_sessions(user_id: str, limit: int = 50) -> list[dict]:
    """List all sessions for a user, sorted by most recent."""
    db = await get_mongodb()
    cursor = (
        db.chat_sessions.find({"user_id": user_id}, {"_id": 0})
        .sort("updated_at", -1)
        .limit(limit)
    )
    return await cursor.to_list(length=limit)


async def update_session(thread_id: str, **kwargs):
    """Update session fields (title, message_count, etc.)."""
    db = await get_mongodb()
    kwargs["updated_at"] = datetime.now(timezone.utc)
    await db.chat_sessions.update_one(
        {"thread_id": thread_id},
        {"$set": kwargs},
    )


async def delete_session(thread_id: str):
    """Delete a session."""
    db = await get_mongodb()
    await db.chat_sessions.delete_one({"thread_id": thread_id})
