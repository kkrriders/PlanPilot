from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid

from src.core.database import get_db
from src.core.dependencies import get_current_user
from src.models.user import User
from src.models.plan import Plan
from src.services.simulation.simulator import simulate_step, reset_simulation

router = APIRouter(prefix="/plans/{plan_id}/simulate", tags=["simulation"])


async def _check_plan(plan_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> Plan:
    result = await db.execute(select(Plan).where(Plan.id == plan_id, Plan.user_id == user_id))
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    if plan.status not in ("active", "generating"):
        raise HTTPException(status_code=409, detail="Plan must be active to simulate")
    return plan


@router.post("/step")
async def step(
    plan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_plan(plan_id, current_user.id, db)
    return await simulate_step(str(plan_id), db)


@router.post("/reset")
async def reset(
    plan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Plan).where(Plan.id == plan_id, Plan.user_id == current_user.id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Plan not found")
    return await reset_simulation(str(plan_id), db)
