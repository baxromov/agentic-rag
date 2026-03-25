"""Rate limiter configuration using slowapi (Starlette-native, Redis-backed)."""
from fastapi import Request
from slowapi import Limiter

from src.config.settings import get_settings


def _get_user_identifier(request: Request) -> str:
    """Use JWT sub claim as rate-limit key for per-user limits, fall back to IP."""
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        try:
            from jose import jwt

            settings = get_settings()
            payload = jwt.decode(
                auth[7:],
                settings.jwt_secret_key,
                algorithms=[settings.jwt_algorithm],
            )
            sub = payload.get("sub")
            if sub:
                return f"user:{sub}"
        except Exception:
            pass
    # Fallback to client IP
    if request.client:
        return request.client.host
    return "unknown"


limiter = Limiter(
    key_func=_get_user_identifier,
    storage_uri=get_settings().redis_url,
)
