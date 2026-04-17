from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid

from src.core.database import get_db
from src.core.dependencies import get_current_user
from src.core.limiter import limiter
from src.models.user import User
from src.models.plan import Plan
from src.models.drift import DriftMetric, DriftEvent
from src.schemas.drift import DriftMetricOut, DriftEventOut, ReplanPreview
from src.services.drift.detector import compute_drift
from src.services.drift.replanning_engine import generate_replan_preview, apply_replan
from src.services.cache.redis_cache import set_json, get_json, delete as cache_delete

router = APIRouter(prefix="/plans/{plan_id}/drift", tags=["drift"])

_DRIFT_CACHE_MINUTES = 10


@router.get("/metrics", response_model=DriftMetricOut)
async def get_latest_drift(
    plan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_plan_ownership(plan_id, current_user.id, db)

    # Return cached metric if computed within the last 10 minutes
    latest_result = await db.execute(
        select(DriftMetric)
        .where(DriftMetric.plan_id == plan_id)
        .order_by(DriftMetric.computed_at.desc())
        .limit(1)
    )
    latest = latest_result.scalar_one_or_none()
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=_DRIFT_CACHE_MINUTES)
    if latest and latest.computed_at.replace(tzinfo=timezone.utc) > cutoff:
        return latest

    # Compute and persist a fresh metric
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


def _preview_cache_key(plan_id: uuid.UUID, user_id: uuid.UUID) -> str:
    return f"replan_preview:{plan_id}:{user_id}"


@router.get("/replan/preview")
@limiter.limit("10/minute")
async def preview_replan(
    request: Request,
    plan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_plan_ownership(plan_id, current_user.id, db)
    preview = await generate_replan_preview(str(plan_id), db)

    # Cache the full preview (including internal scheduling keys) for 5 minutes
    # so apply_replan can use the exact version the user reviewed
    cache_key = _preview_cache_key(plan_id, current_user.id)
    await set_json(cache_key, preview, ttl_seconds=300)

    # Strip internal keys before returning to the client
    preview.pop("_scheduled_new", None)
    preview.pop("_new_critical_path_ids", None)
    return preview


@router.post("/replan")
@limiter.limit("5/minute")
async def apply_replan_endpoint(
    request: Request,
    plan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_plan_ownership(plan_id, current_user.id, db)

    # Use the cached preview the user already reviewed; fall back to a fresh call
    # only if the cache expired (>5 min since they opened the modal)
    cache_key = _preview_cache_key(plan_id, current_user.id)
    preview = await get_json(cache_key)
    if preview is None:
        preview = await generate_replan_preview(str(plan_id), db)

    version = await apply_replan(str(plan_id), preview, db)
    await cache_delete(cache_key)
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
