from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from src.api.auth_dependencies import get_current_user
from src.models.auth import LoginRequest, RefreshRequest, TokenResponse, UserResponse
from src.services.auth import create_access_token, create_refresh_token, decode_token, verify_password
from src.services.mongodb import get_mongodb

router = APIRouter(prefix="/auth", tags=["auth"])


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


@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest):
    db = await get_mongodb()
    user = await db.users.find_one({"username": request.username})

    if not user or not verify_password(request.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    if not user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled",
        )

    # Update last login
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"last_login": datetime.now(timezone.utc)}},
    )

    token_data = {"sub": user["username"], "role": user["role"]}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
        user=_user_response(user),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(request: RefreshRequest):
    payload = decode_token(request.refresh_token)
    if payload is None or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    db = await get_mongodb()
    user = await db.users.find_one({"username": payload.get("sub")})
    if not user or not user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    token_data = {"sub": user["username"], "role": user["role"]}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
        user=_user_response(user),
    )


@router.get("/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    return _user_response(user)
