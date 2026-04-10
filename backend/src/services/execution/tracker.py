"""
Writes execution log entries and updates task state.
"""
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid

from src.models.task import Task
from src.models.execution import ExecutionLog


async def log_event(
    task_id: uuid.UUID,
    plan_id: uuid.UUID,
    event_type: str,
    pct_complete: float,
    note: str | None,
    new_status: str | None,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> ExecutionLog:
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise ValueError(f"Task {task_id} not found")

    prev_status = task.status
    now = datetime.now(timezone.utc)

    # Update task state
    if new_status:
        task.status = new_status
    if event_type == "started" and not task.actual_start:
        task.actual_start = now
    if event_type in ("completed", "failed") and not task.actual_end:
        task.actual_end = now
        if event_type == "completed":
            # Compute actual hours if we have start time
            if task.actual_start:
                delta = (now - task.actual_start).total_seconds() / 3600
                task.actual_hours = round(delta, 2)
            task.status = "completed"

    log = ExecutionLog(
        task_id=task_id,
        plan_id=plan_id,
        event_type=event_type,
        prev_status=prev_status,
        new_status=task.status,
        pct_complete=pct_complete,
        note=note,
        logged_by=user_id,
    )
    db.add(log)
    await db.flush()
    return log


async def get_timeline(plan_id: uuid.UUID, db: AsyncSession) -> list[dict]:
    result = await db.execute(select(Task).where(Task.plan_id == plan_id))
    tasks = result.scalars().all()

    now = datetime.now(timezone.utc)
    entries = []
    for task in tasks:
        # Get latest pct_complete
        log_result = await db.execute(
            select(ExecutionLog)
            .where(ExecutionLog.task_id == task.id)
            .order_by(ExecutionLog.logged_at.desc())
            .limit(1)
        )
        latest_log = log_result.scalar_one_or_none()
        pct = latest_log.pct_complete if latest_log else 0.0

        is_delayed = (
            task.planned_end is not None
            and task.status not in ("completed", "skipped", "failed")
            and now > task.planned_end
        )

        entries.append({
            "task_id": str(task.id),
            "name": task.name,
            "category": task.category,
            "status": task.status,
            "is_on_critical_path": task.is_on_critical_path,
            "planned_start": task.planned_start.isoformat() if task.planned_start else None,
            "planned_end": task.planned_end.isoformat() if task.planned_end else None,
            "actual_start": task.actual_start.isoformat() if task.actual_start else None,
            "actual_end": task.actual_end.isoformat() if task.actual_end else None,
            "pct_complete": pct,
            "is_delayed": is_delayed,
        })

    return entries
