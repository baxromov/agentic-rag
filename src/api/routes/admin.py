from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
import httpx

from src.api.auth_dependencies import require_admin
from src.config.settings import get_settings
from src.models.auth import UserCreate, UserResponse, UserRole, UserUpdate
from src.services.auth import hash_password
from src.services.mongodb import get_mongodb

router = APIRouter(prefix="/admin", tags=["admin"])


def _user_response(user: dict) -> UserResponse:
    return UserResponse(
        id=str(user["_id"]),
        username=user["username"],
        role=user["role"],
        full_name=user.get("full_name", ""),
        department=user.get("department", ""),
        is_active=user.get("is_active", True),
        created_at=user.get("created_at", datetime.now(timezone.utc)),
        last_login=user.get("last_login"),
    )


@router.get("/users", response_model=list[UserResponse])
async def list_users(_: dict = Depends(require_admin)):
    db = await get_mongodb()
    users = await db.users.find().to_list(1000)
    return [_user_response(u) for u in users]


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(data: UserCreate, _: dict = Depends(require_admin)):
    db = await get_mongodb()

    existing = await db.users.find_one({"username": data.username})
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    user_doc = {
        "username": data.username,
        "password_hash": hash_password(data.password),
        "role": data.role.value,
        "full_name": data.full_name,
        "department": data.department,
        "is_active": True,
        "created_at": datetime.now(timezone.utc),
        "last_login": None,
    }
    result = await db.users.insert_one(user_doc)
    user_doc["_id"] = result.inserted_id
    return _user_response(user_doc)


@router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(user_id: str, data: UserUpdate, _: dict = Depends(require_admin)):
    from bson import ObjectId

    db = await get_mongodb()
    update_fields: dict = {}

    if data.password is not None:
        update_fields["password_hash"] = hash_password(data.password)
    if data.role is not None:
        update_fields["role"] = data.role.value
    if data.full_name is not None:
        update_fields["full_name"] = data.full_name
    if data.department is not None:
        update_fields["department"] = data.department
    if data.is_active is not None:
        update_fields["is_active"] = data.is_active

    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    try:
        result = await db.users.find_one_and_update(
            {"_id": ObjectId(user_id)},
            {"$set": update_fields},
            return_document=True,
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user ID")

    if result is None:
        raise HTTPException(status_code=404, detail="User not found")

    return _user_response(result)


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(require_admin)):
    from bson import ObjectId

    db = await get_mongodb()

    try:
        user = await db.users.find_one({"_id": ObjectId(user_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user ID")

    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent deleting yourself
    if str(user["_id"]) == str(admin["_id"]):
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    await db.users.delete_one({"_id": ObjectId(user_id)})
    return {"deleted": True}


# ── Department CRUD ──────────────────────────────────────────────

@router.get("/departments")
async def list_departments(_: dict = Depends(require_admin)):
    db = await get_mongodb()
    docs = await db.departments.find().sort("name", 1).to_list(100)
    return [{"id": str(d["_id"]), "name": d["name"]} for d in docs]


@router.post("/departments", status_code=status.HTTP_201_CREATED)
async def create_department(data: dict, _: dict = Depends(require_admin)):
    name = (data.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Department name is required")

    db = await get_mongodb()
    existing = await db.departments.find_one({"name": name})
    if existing:
        raise HTTPException(status_code=400, detail="Department already exists")

    result = await db.departments.insert_one({"name": name})
    return {"id": str(result.inserted_id), "name": name}


@router.delete("/departments/{department_id}")
async def delete_department(department_id: str, _: dict = Depends(require_admin)):
    from bson import ObjectId

    db = await get_mongodb()
    try:
        result = await db.departments.delete_one({"_id": ObjectId(department_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid department ID")

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Department not found")
    return {"deleted": True}


@router.get("/settings")
async def get_admin_settings(_: dict = Depends(require_admin)):
    db = await get_mongodb()
    settings = get_settings()

    # Get saved settings from MongoDB (overrides)
    saved = await db.app_settings.find_one({"_id": "app_config"}) or {}

    return {
        "langfuse": {
            "enabled": saved.get("langfuse_enabled", settings.langfuse_enabled),
            "host": saved.get("langfuse_host", settings.langfuse_host),
            "public_key": saved.get("langfuse_public_key", settings.langfuse_public_key),
            "secret_key": saved.get("langfuse_secret_key", settings.langfuse_secret_key),
        },
        "llm": {
            "provider": saved.get("llm_provider", settings.llm_provider.value),
            "claude_model": saved.get("claude_model", settings.claude_model),
            "openai_model": saved.get("openai_model", settings.openai_model),
            "ollama_model": saved.get("ollama_model", settings.ollama_model),
        },
        "rag": {
            "chunk_size": saved.get("chunk_size", settings.chunk_size),
            "chunk_overlap": saved.get("chunk_overlap", settings.chunk_overlap),
            "retrieval_top_k": saved.get("retrieval_top_k", settings.retrieval_top_k),
            "rerank_top_k": saved.get("rerank_top_k", settings.rerank_top_k),
            "rrf_k": saved.get("rrf_k", settings.rrf_k),
        },
        "personalization": {
            "language_preference": saved.get("language_preference", "auto"),
            "expertise_level": saved.get("expertise_level", "general"),
            "response_style": saved.get("response_style", "balanced"),
            "enable_citations": saved.get("enable_citations", True),
        },
    }


@router.put("/settings")
async def update_admin_settings(data: dict, _: dict = Depends(require_admin)):
    db = await get_mongodb()

    # Flatten nested dict for storage
    flat: dict = {}
    has_langfuse_changes = False
    for section in ("langfuse", "llm", "rag", "personalization"):
        if section in data:
            for key, value in data[section].items():
                if section == "langfuse":
                    flat[f"langfuse_{key}"] = value
                    has_langfuse_changes = True
                elif section == "personalization":
                    flat[key] = value
                elif section == "llm":
                    flat[key] = value
                else:
                    flat[key] = value

    if flat:
        await db.app_settings.update_one(
            {"_id": "app_config"},
            {"$set": flat},
            upsert=True,
        )

    # Invalidate Langfuse cache so changes take effect immediately
    if has_langfuse_changes:
        from src.utils.langfuse_integration import invalidate_langfuse_cache
        invalidate_langfuse_cache()

    return {"updated": True}


@router.get("/personalization")
async def get_personalization_settings():
    """Public endpoint — returns personalization settings for all users."""
    db = await get_mongodb()
    saved = await db.app_settings.find_one({"_id": "app_config"}) or {}

    return {
        "language_preference": saved.get("language_preference", "auto"),
        "expertise_level": saved.get("expertise_level", "general"),
        "response_style": saved.get("response_style", "balanced"),
        "enable_citations": saved.get("enable_citations", True),
    }


@router.get("/feedbacks")
async def list_feedbacks(
    rating: str | None = None,
    _: dict = Depends(require_admin),
):
    """List all user feedbacks. Optionally filter by rating ('up' or 'down')."""
    db = await get_mongodb()

    query: dict = {}
    if rating in ("up", "down"):
        query["rating"] = rating

    cursor = db.message_feedback.find(query).sort("updated_at", -1).limit(200)

    feedbacks = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        # Resolve username
        if doc.get("user_id"):
            from bson import ObjectId
            try:
                user = await db.users.find_one({"_id": ObjectId(doc["user_id"])})
                doc["username"] = user["username"] if user else "unknown"
            except Exception:
                doc["username"] = "unknown"
        feedbacks.append(doc)

    return feedbacks


@router.get("/system-health")
async def system_health(_: dict = Depends(require_admin)):
    settings = get_settings()
    services = {}

    # MongoDB
    try:
        db = await get_mongodb()
        await db.command("ping")
        services["mongodb"] = {"status": "healthy"}
    except Exception as e:
        services["mongodb"] = {"status": "unhealthy", "error": str(e)}

    # Qdrant
    try:
        async with httpx.AsyncClient(verify=False) as client:
            r = await client.get(f"{settings.qdrant_url}/healthz", timeout=5)
            services["qdrant"] = {"status": "healthy" if r.status_code == 200 else "unhealthy"}
    except Exception as e:
        services["qdrant"] = {"status": "unhealthy", "error": str(e)}

    # MinIO
    try:
        from src.api.dependencies import get_minio_service
        minio = get_minio_service()
        ok = minio.health_check()
        services["minio"] = {"status": "healthy" if ok else "unhealthy"}
    except Exception as e:
        services["minio"] = {"status": "unhealthy", "error": str(e)}

    # Redis
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(settings.redis_url)
        await r.ping()
        await r.aclose()
        services["redis"] = {"status": "healthy"}
    except Exception as e:
        services["redis"] = {"status": "unhealthy", "error": str(e)}

    # Model Server
    try:
        async with httpx.AsyncClient(verify=False) as client:
            r = await client.get(f"{settings.model_server_url}/health", timeout=5)
            services["model_server"] = {"status": "healthy" if r.status_code == 200 else "unhealthy"}
    except Exception as e:
        services["model_server"] = {"status": "unhealthy", "error": str(e)}

    # LangGraph
    try:
        async with httpx.AsyncClient(verify=False) as client:
            r = await client.get(f"{settings.langgraph_api_url}/ok", timeout=5)
            services["langgraph"] = {"status": "healthy" if r.status_code == 200 else "unhealthy"}
    except Exception as e:
        services["langgraph"] = {"status": "unhealthy", "error": str(e)}

    all_healthy = all(s["status"] == "healthy" for s in services.values())
    return {"status": "healthy" if all_healthy else "degraded", "services": services}


@router.get("/analytics")
async def get_analytics(
    days: int = Query(default=30, ge=1, le=365),
    _: dict = Depends(require_admin),
):
    """Return analytics data: query volume, user activity, feedback stats."""
    db = await get_mongodb()
    since = datetime.now(timezone.utc) - timedelta(days=days)

    # --- Query volume by day (from chat_sessions) ---
    query_volume_pipeline = [
        {"$match": {"created_at": {"$gte": since}}},
        {
            "$group": {
                "_id": {
                    "$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}
                },
                "count": {"$sum": 1},
                "messages": {"$sum": "$message_count"},
            }
        },
        {"$sort": {"_id": 1}},
    ]
    query_volume = []
    async for doc in db.chat_sessions.aggregate(query_volume_pipeline):
        query_volume.append(
            {"date": doc["_id"], "sessions": doc["count"], "messages": doc["messages"]}
        )

    # --- User activity by day ---
    user_activity_pipeline = [
        {"$match": {"created_at": {"$gte": since}}},
        {
            "$group": {
                "_id": {
                    "date": {
                        "$dateToString": {
                            "format": "%Y-%m-%d",
                            "date": "$created_at",
                        }
                    },
                    "user": "$user_id",
                },
            }
        },
        {"$group": {"_id": "$_id.date", "active_users": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ]
    user_activity = []
    async for doc in db.chat_sessions.aggregate(user_activity_pipeline):
        user_activity.append(
            {"date": doc["_id"], "active_users": doc["active_users"]}
        )

    # --- Feedback stats by day ---
    feedback_pipeline = [
        {"$match": {"created_at": {"$gte": since}}},
        {
            "$group": {
                "_id": {
                    "date": {
                        "$dateToString": {
                            "format": "%Y-%m-%d",
                            "date": "$created_at",
                        }
                    },
                    "rating": "$rating",
                },
                "count": {"$sum": 1},
            }
        },
        {"$sort": {"_id.date": 1}},
    ]
    feedback_by_day: dict[str, dict] = {}
    async for doc in db.message_feedback.aggregate(feedback_pipeline):
        date = doc["_id"]["date"]
        rating = doc["_id"]["rating"]
        if date not in feedback_by_day:
            feedback_by_day[date] = {"date": date, "positive": 0, "negative": 0}
        if rating == "up":
            feedback_by_day[date]["positive"] = doc["count"]
        else:
            feedback_by_day[date]["negative"] = doc["count"]
    feedback_timeline = sorted(feedback_by_day.values(), key=lambda x: x["date"])

    # --- Top users by session count ---
    top_users_pipeline = [
        {"$match": {"created_at": {"$gte": since}}},
        {
            "$group": {
                "_id": "$user_id",
                "sessions": {"$sum": 1},
                "messages": {"$sum": "$message_count"},
            }
        },
        {"$sort": {"sessions": -1}},
        {"$limit": 10},
    ]
    top_users = []
    async for doc in db.chat_sessions.aggregate(top_users_pipeline):
        user_id = doc["_id"]
        username = "unknown"
        if user_id:
            from bson import ObjectId
            try:
                user = await db.users.find_one({"_id": ObjectId(user_id)})
                if user:
                    username = user.get("full_name") or user["username"]
            except Exception:
                pass
        top_users.append(
            {"user": username, "sessions": doc["sessions"], "messages": doc["messages"]}
        )

    # --- Summary totals ---
    total_sessions = await db.chat_sessions.count_documents({})
    total_sessions_period = await db.chat_sessions.count_documents(
        {"created_at": {"$gte": since}}
    )
    total_users = await db.users.count_documents({})
    total_feedback = await db.message_feedback.count_documents({})
    positive_feedback = await db.message_feedback.count_documents({"rating": "up"})
    negative_feedback = await db.message_feedback.count_documents({"rating": "down"})

    # Document stats from Qdrant + MinIO
    doc_stats = {"total_documents": 0, "total_chunks": 0}
    try:
        from src.api.dependencies import get_qdrant_service
        qdrant = await get_qdrant_service()
        info = await qdrant.get_collection_info()
        doc_stats["total_chunks"] = info.get("points_count", 0)
    except Exception:
        pass
    try:
        from src.api.dependencies import get_minio_service
        minio = get_minio_service()
        objects = list(minio.client.list_objects(minio.bucket_name, recursive=True))
        doc_stats["total_documents"] = len(objects)
    except Exception:
        pass

    return {
        "summary": {
            "total_sessions": total_sessions,
            "sessions_in_period": total_sessions_period,
            "total_users": total_users,
            "total_feedback": total_feedback,
            "positive_feedback": positive_feedback,
            "negative_feedback": negative_feedback,
            "total_documents": doc_stats["total_documents"],
            "total_chunks": doc_stats["total_chunks"],
        },
        "query_volume": query_volume,
        "user_activity": user_activity,
        "feedback_timeline": feedback_timeline,
        "top_users": top_users,
    }
