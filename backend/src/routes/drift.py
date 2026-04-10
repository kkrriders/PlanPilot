from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid

from src.core.database import get_db
from src.core.dependencies import get_current_user
from src.models.user import User
from src.models.plan import Plan
from src.models.drift import DriftMetric, DriftEvent
from src.schemas.drift import DriftMetricOut, DriftEventOut, ReplanPreview
from src.services.drift.detector import compute_drift
from src.services.drift.replanning_engine import generate_replan_preview, apply_replan

router = APIRouter(prefix="/plans/{plan_id}/drift", tags=["drift"])


@router.get("/metrics", response_model=DriftMetricOut)
async def get_latest_drift(
    plan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_plan_ownership(plan_id, current_user.id, db)

    # Compute fresh metric
    metric = await compute_drift(str(plan_id), db)
    await db.commit()
    return metric


@router.get("/history", response_model=list[DriftMetricOut])
async def get_drift_history(
    plan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_plan_ownership(plan_id, current_user.id, db)
    result = await db.execute(
        select(DriftMetric)
        .where(DriftMetric.plan_id == plan_id)
        .order_by(DriftMetric.computed_at.desc())
        .limit(50)
    )
    return result.scalars().all()


@router.get("/events", response_model=list[DriftEventOut])
async def get_drift_events(
    plan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_plan_ownership(plan_id, current_user.id, db)
    result = await db.execute(
        select(DriftEvent)
        .where(DriftEvent.plan_id == plan_id)
        .order_by(DriftEvent.created_at.desc())
    )
    return result.scalars().all()


@router.get("/replan/preview")
async def preview_replan(
    plan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_plan_ownership(plan_id, current_user.id, db)
    preview = await generate_replan_preview(str(plan_id), db)
    # Strip internal keys before returning
    preview.pop("_scheduled_new", None)
    preview.pop("_new_critical_path_ids", None)
    return preview


@router.post("/replan")
async def apply_replan_endpoint(
    plan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_plan_ownership(plan_id, current_user.id, db)
    preview = await generate_replan_preview(str(plan_id), db)
    version = await apply_replan(str(plan_id), preview, db)
    return {
        "message": "Replan applied successfully",
        "new_version": version.version,
        "plan_id": str(plan_id),
    }


async def _check_plan_ownership(plan_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> Plan:
    result = await db.execute(select(Plan).where(Plan.id == plan_id, Plan.user_id == user_id))
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan
