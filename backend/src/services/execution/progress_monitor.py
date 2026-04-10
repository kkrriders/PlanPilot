"""
Celery beat task: scan active plans for delays and emit drift events.
"""
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.plan import Plan
from src.models.task import Task
from src.models.drift import DriftEvent


async def scan_for_delays(db: AsyncSession) -> int:
    """
    Scans all active plans. For each task past its planned_end and not complete,
    creates a DriftEvent. Returns count of events created.
    """
    now = datetime.now(timezone.utc)
    events_created = 0

    result = await db.execute(select(Plan).where(Plan.status == "active"))
    plans = result.scalars().all()

    for plan in plans:
        task_result = await db.execute(
            select(Task).where(
                Task.plan_id == plan.id,
                Task.status.in_(["pending", "in_progress", "blocked"]),
                Task.planned_end < now,
            )
        )
        delayed_tasks = task_result.scalars().all()

        for task in delayed_tasks:
            # Check if we already have an unresolved drift event for this task
            existing = await db.execute(
                select(DriftEvent).where(
                    DriftEvent.task_id == task.id,
                    DriftEvent.trigger_type == "delay",
                    DriftEvent.was_replanned == False,  # noqa: E712
                )
            )
            if existing.scalar_one_or_none():
                continue

            delay_hours = (now - task.planned_end).total_seconds() / 3600
            event = DriftEvent(
                plan_id=plan.id,
                task_id=task.id,
                trigger_type="delay",
                description=f"Task '{task.name}' is {delay_hours:.1f}h past its planned end",
                was_replanned=False,
            )
            db.add(event)
            events_created += 1

    if events_created:
        await db.commit()

    return events_created
