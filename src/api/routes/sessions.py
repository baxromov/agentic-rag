from fastapi import APIRouter, Depends, HTTPException, status
from langgraph_sdk import get_client
from langgraph_sdk.errors import NotFoundError
from pydantic import BaseModel

from src.api.auth_dependencies import get_current_user
from src.config.settings import get_settings

router = APIRouter(prefix="/sessions", tags=["sessions"])


class UpdateTitleRequest(BaseModel):
    title: str


def _user_id(user: dict) -> str:
    return str(user["_id"])


@router.get("")
async def list_sessions(user: dict = Depends(get_current_user)):
    """List all chat sessions for the current user."""
    settings = get_settings()
    client = get_client(url=settings.langgraph_api_url)
    uid = _user_id(user)

    threads = await client.threads.search(
        metadata={"user_id": uid},
        limit=50,
    )

    sessions = []
    for t in threads:
        meta = t.get("metadata", {}) or {}
        sessions.append({
            "thread_id": t["thread_id"],
            "title": meta.get("title", "New Chat"),
            "created_at": t.get("created_at", ""),
            "updated_at": t.get("updated_at", ""),
            "message_count": meta.get("message_count", 0),
        })

    # Sort by updated_at descending
    sessions.sort(key=lambda s: s["updated_at"] or "", reverse=True)
    return sessions


@router.post("")
async def create_session(user: dict = Depends(get_current_user)):
    """Create a new chat session."""
    settings = get_settings()
    client = get_client(url=settings.langgraph_api_url)
    uid = _user_id(user)

    thread = await client.threads.create(
        metadata={"user_id": uid, "title": "New Chat", "message_count": 0}
    )

    meta = thread.get("metadata", {}) or {}
    return {
        "thread_id": thread["thread_id"],
        "title": meta.get("title", "New Chat"),
        "created_at": thread.get("created_at", ""),
        "updated_at": thread.get("updated_at", ""),
        "message_count": 0,
    }


@router.get("/{thread_id}/messages")
async def get_session_messages(thread_id: str, user: dict = Depends(get_current_user)):
    """Load messages for a specific session."""
    settings = get_settings()
    client = get_client(url=settings.langgraph_api_url)
    uid = _user_id(user)

    # Verify ownership
    try:
        thread = await client.threads.get(thread_id)
    except NotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    meta = thread.get("metadata", {}) or {}
    if meta.get("user_id") != uid:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # Get thread state to extract messages and sources
    try:
        state = await client.threads.get_state(thread_id)
        values = state.get("values", {})
        raw_messages = values.get("messages", [])
        raw_documents = values.get("documents", [])
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
async def update_session(
    thread_id: str,
    body: UpdateTitleRequest,
    user: dict = Depends(get_current_user),
):
    """Update session title."""
    settings = get_settings()
    client = get_client(url=settings.langgraph_api_url)
    uid = _user_id(user)

    # Verify ownership
    try:
        thread = await client.threads.get(thread_id)
    except NotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    meta = thread.get("metadata", {}) or {}
    if meta.get("user_id") != uid:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    updated_meta = {**meta, "title": body.title}
    await client.threads.update(thread_id, metadata=updated_meta)
    return {"status": "ok"}


@router.delete("/{thread_id}")
async def delete_session(thread_id: str, user: dict = Depends(get_current_user)):
    """Delete a chat session."""
    settings = get_settings()
    client = get_client(url=settings.langgraph_api_url)
    uid = _user_id(user)

    # Verify ownership
    try:
        thread = await client.threads.get(thread_id)
    except NotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    meta = thread.get("metadata", {}) or {}
    if meta.get("user_id") != uid:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    await client.threads.delete(thread_id)
    return {"status": "deleted"}
