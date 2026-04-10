from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid

from src.core.database import get_db
from src.core.dependencies import get_current_user
from src.models.user import User
from src.models.plan import Plan
from src.models.team import TeamMember
from src.schemas.team import TeamMemberCreate, TeamMemberUpdate, TeamMemberOut

router = APIRouter(prefix="/plans/{plan_id}/team", tags=["team"])

MEMBER_COLORS = [
    "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
    "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16",
]


async def _check_ownership(plan_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> Plan:
    result = await db.execute(select(Plan).where(Plan.id == plan_id, Plan.user_id == user_id))
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan


@router.get("", response_model=list[TeamMemberOut])
async def list_team(
    plan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_ownership(plan_id, current_user.id, db)
    result = await db.execute(
        select(TeamMember).where(TeamMember.plan_id == plan_id).order_by(TeamMember.created_at)
    )
    return result.scalars().all()


@router.post("", response_model=TeamMemberOut, status_code=201)
async def add_member(
    plan_id: uuid.UUID,
    body: TeamMemberCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_ownership(plan_id, current_user.id, db)

    # Auto-assign color if default
    if body.color == "#3b82f6":
        count_result = await db.execute(
            select(TeamMember).where(TeamMember.plan_id == plan_id)
        )
        count = len(count_result.scalars().all())
        body.color = MEMBER_COLORS[count % len(MEMBER_COLORS)]

    member = TeamMember(
        plan_id=plan_id,
        name=body.name,
        role=body.role,
        skills=body.skills,
        color=body.color,
    )
    db.add(member)
    await db.commit()
    await db.refresh(member)
    return member


@router.patch("/{member_id}", response_model=TeamMemberOut)
async def update_member(
    plan_id: uuid.UUID,
    member_id: uuid.UUID,
    body: TeamMemberUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_ownership(plan_id, current_user.id, db)
    result = await db.execute(
        select(TeamMember).where(TeamMember.id == member_id, TeamMember.plan_id == plan_id)
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Team member not found")

    if body.name is not None:
        member.name = body.name
    if body.role is not None:
        member.role = body.role
    if body.skills is not None:
        member.skills = body.skills
    if body.color is not None:
        member.color = body.color

    await db.commit()
    await db.refresh(member)
    return member


@router.delete("/{member_id}", status_code=204)
async def remove_member(
    plan_id: uuid.UUID,
    member_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_ownership(plan_id, current_user.id, db)
    result = await db.execute(
        select(TeamMember).where(TeamMember.id == member_id, TeamMember.plan_id == plan_id)
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Team member not found")
    await db.delete(member)
    await db.commit()
