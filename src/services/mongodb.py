import motor.motor_asyncio

from src.config.settings import get_settings

_client: motor.motor_asyncio.AsyncIOMotorClient | None = None
_db: motor.motor_asyncio.AsyncIOMotorDatabase | None = None


async def get_mongodb() -> motor.motor_asyncio.AsyncIOMotorDatabase:
    global _client, _db
    if _db is None:
        settings = get_settings()
        _client = motor.motor_asyncio.AsyncIOMotorClient(settings.mongodb_url)
        _db = _client.rag_auth
        # Ensure unique index on username
        await _db.users.create_index("username", unique=True)
        # Index for message feedback lookups
        await _db.message_feedback.create_index(
            [("thread_id", 1), ("message_index", 1)]
        )
    return _db
