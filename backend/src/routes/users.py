from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid

from src.core.database import get_db
from src.core.dependencies import get_current_user
from src.core.limiter import limiter
from src.models.user import User

router = APIRouter(prefix="/users", tags=["users"])


class UserMeOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str | None

    model_config = {"from_attributes": True}


class UserMeUpdate(BaseModel):
    full_name: str | None = None


@router.get("/me", response_model=UserMeOut)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserMeOut)
@limiter.limit("10/minute")
async def update_me(
    request: Request,
    body: UserMeUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.full_name is not None:
        current_user.full_name = body.full_name.strip() or None
    await db.commit()
    await db.refresh(current_user)
    return current_user
