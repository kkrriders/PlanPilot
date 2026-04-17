import hashlib
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from src.core.database import get_db
from src.core.security import hash_password, verify_password, create_access_token, create_refresh_token, decode_token
from src.models.user import User
from src.schemas.user import UserRegister, UserLogin, UserOut, TokenOut, RefreshIn
from src.core.limiter import limiter
from src.services.cache.redis_cache import get_redis

router = APIRouter(prefix="/auth", tags=["auth"])

_REFRESH_TTL = 60 * 60 * 24 * 7  # 7 days in seconds


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def _store_refresh_token(token: str) -> None:
    key = f"refresh:{_token_hash(token)}"
    await get_redis().setex(key, _REFRESH_TTL, "1")


async def _revoke_refresh_token(token: str) -> None:
    await get_redis().delete(f"refresh:{_token_hash(token)}")


async def _refresh_token_valid(token: str) -> bool:
    return await get_redis().exists(f"refresh:{_token_hash(token)}") == 1


@router.post("/register", response_model=UserOut, status_code=201)
@limiter.limit("10/minute")
async def register(request: Request, body: UserRegister, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=body.email,
        hashed_pw=hash_password(body.password),
        full_name=body.full_name,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/login", response_model=TokenOut)
@limiter.limit("10/minute")
async def login(request: Request, body: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_pw):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    refresh_token = create_refresh_token(str(user.id))
    await _store_refresh_token(refresh_token)
    return TokenOut(
        access_token=create_access_token(str(user.id)),
        refresh_token=refresh_token,
    )


@router.post("/logout", status_code=204)
@limiter.limit("20/minute")
async def logout(request: Request, body: RefreshIn):
    await _revoke_refresh_token(body.refresh_token)


@router.post("/refresh", response_model=TokenOut)
@limiter.limit("20/minute")
async def refresh(request: Request, body: RefreshIn, db: AsyncSession = Depends(get_db)):
    payload = decode_token(body.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    if not await _refresh_token_valid(body.refresh_token):
        raise HTTPException(status_code=401, detail="Refresh token has been revoked")

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    # Rotate: revoke old token, issue new pair
    await _revoke_refresh_token(body.refresh_token)
    new_refresh = create_refresh_token(str(user.id))
    await _store_refresh_token(new_refresh)
    return TokenOut(
        access_token=create_access_token(str(user.id)),
        refresh_token=new_refresh,
    )
