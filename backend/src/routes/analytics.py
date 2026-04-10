from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
import uuid

from src.core.database import get_db
from src.core.dependencies import get_current_user
from src.models.user import User
from src.models.plan import Plan
from src.models.task import Task
from src.models.drift import DriftMetric
from src.services.learning.adaptive_weights import get_user_weights

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/summary")
async def get_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    plan_result = await db.execute(
        select(Plan).where(Plan.user_id == current_user.id)
    )
    plans = plan_result.scalars().all()

    completed = [p for p in plans if p.status == "completed"]
    active = [p for p in plans if p.status == "active"]

    avg_risk = sum(p.risk_score for p in plans if p.risk_score) / len(plans) if plans else 0
    avg_confidence = sum(p.confidence for p in plans if p.confidence) / len(plans) if plans else 0

    return {
        "total_plans": len(plans),
        "completed_plans": len(completed),
        "active_plans": len(active),
        "avg_risk_score": round(avg_risk, 3),
        "avg_confidence": round(avg_confidence, 3),
    }


@router.get("/plans/{plan_id}/accuracy")
async def get_plan_accuracy(
    plan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns estimated vs actual hours for completed tasks."""
    task_result = await db.execute(
        select(Task).where(
            Task.plan_id == plan_id,
            Task.status == "completed",
            Task.estimated_hours != None,  # noqa: E711
            Task.actual_hours != None,  # noqa: E711
        )
    )
    tasks = task_result.scalars().all()

    data = [
        {
            "task_id": str(t.id),
            "name": t.name,
            "category": t.category,
            "estimated_hours": t.estimated_hours,
            "actual_hours": t.actual_hours,
            "accuracy_ratio": round(t.actual_hours / t.estimated_hours, 3) if t.estimated_hours else None,
        }
        for t in tasks
    ]

    avg_accuracy = sum(d["accuracy_ratio"] for d in data if d["accuracy_ratio"]) / len(data) if data else 1.0

    return {"tasks": data, "avg_accuracy_ratio": round(avg_accuracy, 3)}


@router.get("/plans/{plan_id}/velocity")
async def get_velocity(
    plan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns tasks completed per day."""
    task_result = await db.execute(
        select(Task).where(
            Task.plan_id == plan_id,
            Task.status == "completed",
            Task.actual_end != None,  # noqa: E711
        ).order_by(Task.actual_end)
    )
    tasks = task_result.scalars().all()

    velocity_by_day: dict[str, int] = {}
    for task in tasks:
        day = task.actual_end.date().isoformat()
        velocity_by_day[day] = velocity_by_day.get(day, 0) + 1

    return {"velocity": [{"date": d, "tasks_completed": c} for d, c in sorted(velocity_by_day.items())]}


@router.get("/weights")
async def get_adaptive_weights(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    weights = await get_user_weights(current_user.id, db)
    return {"weights": weights}
