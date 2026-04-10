from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
import uuid
import json

from src.core.database import get_db
from src.core.dependencies import get_current_user
from src.models.user import User
from src.models.plan import Plan
from src.models.task import Task
from src.models.execution import ExecutionLog, Checkpoint
from src.schemas.execution import LogEventCreate, ExecutionLogOut, CheckpointCreate, CheckpointOut
from src.services.execution.tracker import log_event, get_timeline

router = APIRouter(prefix="/plans/{plan_id}/execution", tags=["execution"])


@router.post("/start")
async def start_execution(
    plan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    plan = await _check_plan_ownership(plan_id, current_user.id, db)
    if plan.status not in ("active", "draft"):
        raise HTTPException(status_code=400, detail=f"Cannot start execution from status '{plan.status}'")
    plan.status = "active"
    await db.commit()
    return {"status": "active", "plan_id": str(plan_id)}


@router.post("/tasks/{task_id}/log", response_model=ExecutionLogOut)
async def log_task_event(
    plan_id: uuid.UUID,
    task_id: uuid.UUID,
    body: LogEventCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_plan_ownership(plan_id, current_user.id, db)
    log = await log_event(
        task_id=task_id,
        plan_id=plan_id,
        event_type=body.event_type,
        pct_complete=body.pct_complete,
        note=body.note,
        new_status=body.new_status,
        user_id=current_user.id,
        db=db,
    )
    await db.commit()
    return log


@router.get("/timeline")
async def get_execution_timeline(
    plan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_plan_ownership(plan_id, current_user.id, db)
    return await get_timeline(plan_id, db)


@router.get("/bottlenecks")
async def get_bottlenecks(
    plan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns tasks that are blocking the most successors and are delayed."""
    await _check_plan_ownership(plan_id, current_user.id, db)
    from src.models.task import TaskDependency
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)

    task_result = await db.execute(
        select(Task).where(
            Task.plan_id == plan_id,
            Task.status.in_(["pending", "in_progress", "blocked"]),
        )
    )
    blocked_tasks = task_result.scalars().all()

    dep_result = await db.execute(
        select(TaskDependency).where(TaskDependency.plan_id == plan_id)
    )
    deps = dep_result.scalars().all()

    successor_count: dict[str, int] = {}
    for dep in deps:
        pred = str(dep.predecessor_id)
        successor_count[pred] = successor_count.get(pred, 0) + 1

    bottlenecks = []
    for task in blocked_tasks:
        succ_count = successor_count.get(str(task.id), 0)
        is_delayed = task.planned_end and task.planned_end < now
        if succ_count > 0 or is_delayed:
            bottlenecks.append({
                "task_id": str(task.id),
                "name": task.name,
                "status": task.status,
                "successor_count": succ_count,
                "is_delayed": bool(is_delayed),
                "is_on_critical_path": task.is_on_critical_path,
            })

    return sorted(bottlenecks, key=lambda x: (-x["successor_count"], -int(x["is_on_critical_path"])))


@router.post("/checkpoints", response_model=CheckpointOut, status_code=201)
async def create_checkpoint(
    plan_id: uuid.UUID,
    body: CheckpointCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_plan_ownership(plan_id, current_user.id, db)
    timeline = await get_timeline(plan_id, db)
    cp = Checkpoint(
        plan_id=plan_id,
        label=body.label,
        snapshot={"timeline": timeline},
        is_auto=False,
    )
    db.add(cp)
    await db.commit()
    await db.refresh(cp)
    return cp


@router.get("/checkpoints", response_model=list[CheckpointOut])
async def list_checkpoints(
    plan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_plan_ownership(plan_id, current_user.id, db)
    result = await db.execute(
        select(Checkpoint).where(Checkpoint.plan_id == plan_id).order_by(Checkpoint.created_at.desc())
    )
    return result.scalars().all()


async def _check_plan_ownership(plan_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> Plan:
    result = await db.execute(select(Plan).where(Plan.id == plan_id, Plan.user_id == user_id))
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan
