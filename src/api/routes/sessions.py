from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from src.api.auth_dependencies import get_current_user
from src.services.graph_runner import get_graph
from src.services.session_store import (
    create_session,
    delete_session,
    get_session,
    list_sessions,
    update_session,
)

router = APIRouter(prefix="/sessions", tags=["sessions"])


class UpdateTitleRequest(BaseModel):
    title: str


def _user_id(user: dict) -> str:
    return str(user["_id"])


@router.get("")
async def list_sessions_endpoint(user: dict = Depends(get_current_user)):
    """List all chat sessions for the current user."""
    uid = _user_id(user)
    sessions = await list_sessions(uid)

    return [
        {
            "thread_id": s["thread_id"],
            "title": s.get("title", "New Chat"),
            "created_at": s.get("created_at", ""),
            "updated_at": s.get("updated_at", ""),
            "message_count": s.get("message_count", 0),
        }
        for s in sessions
    ]


@router.post("")
async def create_session_endpoint(user: dict = Depends(get_current_user)):
    """Create a new chat session."""
    uid = _user_id(user)
    session = await create_session(user_id=uid)

    return {
        "thread_id": session["thread_id"],
        "title": session.get("title", "New Chat"),
        "created_at": session.get("created_at", ""),
        "updated_at": session.get("updated_at", ""),
        "message_count": 0,
    }


@router.get("/{thread_id}/messages")
async def get_session_messages(thread_id: str, user: dict = Depends(get_current_user)):
    """Load messages for a specific session."""
    uid = _user_id(user)
    graph = get_graph()

    # Verify ownership
    session = await get_session(thread_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if session.get("user_id") != uid:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # Get messages from graph checkpointer (PostgreSQL)
    config = {"configurable": {"thread_id": thread_id}}
    raw_messages = []
    raw_documents = []
    try:
        state = await graph.aget_state(config)
        if state and state.values:
            raw_messages = state.values.get("messages", [])
            raw_documents = state.values.get("documents", [])
    except Exception:
        raw_messages = []
        raw_documents = []

    # Serialize sources from documents
    sources = _serialize_sources(raw_documents)

    messages = []
    for msg in raw_messages:
        if isinstance(msg, dict):
            role = msg.get("type", "")
            content = msg.get("content", "")
            if role == "human":
                role = "user"
            elif role == "ai":
                role = "assistant"
            else:
                continue
        elif hasattr(msg, "type"):
            role = "user" if msg.type == "human" else "assistant"
            content = msg.content if hasattr(msg, "content") else str(msg)
        else:
            continue

        entry: dict = {"role": role, "content": content}
        # Attach sources to the last assistant message
        if role == "assistant" and sources:
            entry["sources"] = sources
        messages.append(entry)

    return messages


def _serialize_sources(documents: list) -> list[dict]:
    """Convert raw document dicts to SourceDocument-compatible dicts."""
    sources = []
    for doc in documents:
        if isinstance(doc, dict):
            metadata = doc.get("metadata", {})
            sources.append({
                "text": doc.get("page_content", "")[:500],
                "score": metadata.get("score"),
                "page_number": metadata.get("page_number"),
                "source": metadata.get("source"),
                "language": metadata.get("language"),
                "document_id": metadata.get("document_id"),
            })
        elif hasattr(doc, "page_content"):
            metadata = doc.metadata if hasattr(doc, "metadata") else {}
            sources.append({
                "text": doc.page_content[:500],
                "score": metadata.get("score"),
                "page_number": metadata.get("page_number"),
                "source": metadata.get("source"),
                "language": metadata.get("language"),
                "document_id": metadata.get("document_id"),
            })
    return sources


@router.patch("/{thread_id}")
async def update_session_endpoint(
    thread_id: str,
    body: UpdateTitleRequest,
    user: dict = Depends(get_current_user),
):
    """Update session title."""
    uid = _user_id(user)

    # Verify ownership
    session = await get_session(thread_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if session.get("user_id") != uid:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    await update_session(thread_id, title=body.title)
    return {"status": "ok"}


@router.delete("/{thread_id}")
async def delete_session_endpoint(thread_id: str, user: dict = Depends(get_current_user)):
    """Delete a chat session."""
    uid = _user_id(user)

    # Verify ownership
    session = await get_session(thread_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if session.get("user_id") != uid:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    await delete_session(thread_id)
    return {"status": "deleted"}
