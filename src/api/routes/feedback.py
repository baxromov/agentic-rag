from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from src.api.auth_dependencies import get_current_user
from src.services.mongodb import get_mongodb

router = APIRouter(prefix="/feedback", tags=["feedback"])


class FeedbackRequest(BaseModel):
    thread_id: str
    message_index: int
    rating: str  # "up" or "down"
    note: str | None = None


@router.post("")
async def submit_feedback(body: FeedbackRequest, user: dict = Depends(get_current_user)):
    """Submit thumbs up/down feedback on an assistant message."""
    if body.rating not in ("up", "down"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Rating must be 'up' or 'down'")

    if body.rating == "down" and not body.note:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Note is required for negative feedback")

    db = await get_mongodb()
    uid = str(user["_id"])

    # Upsert — one feedback per user per message
    await db.message_feedback.update_one(
        {"user_id": uid, "thread_id": body.thread_id, "message_index": body.message_index},
        {
            "$set": {
                "rating": body.rating,
                "note": body.note,
                "updated_at": datetime.now(timezone.utc),
            },
            "$setOnInsert": {
                "user_id": uid,
                "thread_id": body.thread_id,
                "message_index": body.message_index,
                "created_at": datetime.now(timezone.utc),
            },
        },
        upsert=True,
    )

    return {"status": "ok"}


@router.get("/{thread_id}")
async def get_feedback(thread_id: str, user: dict = Depends(get_current_user)):
    """Get all feedback for a session."""
    db = await get_mongodb()
    uid = str(user["_id"])

    cursor = db.message_feedback.find(
        {"user_id": uid, "thread_id": thread_id},
        {"_id": 0, "user_id": 0},
    )

    feedbacks = []
    async for doc in cursor:
        feedbacks.append(doc)

    return feedbacks
