"""
Drift detection: computes schedule, effort, and scope drift.
"""
from datetime import datetime, timezone
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.plan import Plan, PlanVersion
from src.models.task import Task
from src.models.drift import DriftMetric, DriftEvent


THRESHOLD_LOW = 0.10
THRESHOLD_MEDIUM = 0.15
THRESHOLD_HIGH = 0.30
THRESHOLD_CRITICAL = 0.50


async def compute_drift(plan_id: str, db: AsyncSession) -> DriftMetric:
    plan_result = await db.execute(select(Plan).where(Plan.id == plan_id))
    plan = plan_result.scalar_one_or_none()
    if not plan:
        raise ValueError(f"Plan {plan_id} not found")

    # Get all tasks for current version
    task_result = await db.execute(
        select(Task).where(Task.plan_id == plan.id)
    )
    tasks = task_result.scalars().all()

    completed = [t for t in tasks if t.status == "completed"]
    in_progress = [t for t in tasks if t.status == "in_progress"]
    total = len(tasks)
    now = datetime.now(timezone.utc)

    # --- Schedule drift ---
    planned_completed_hours = sum(t.estimated_hours or 0 for t in completed)
    actual_completed_hours = sum(t.actual_hours or 0 for t in completed)

    schedule_drift_pct = 0.0
    if planned_completed_hours > 0:
        schedule_drift_pct = (actual_completed_hours - planned_completed_hours) / planned_completed_hours

    # Also check tasks that are past due and not complete
    overdue = [
        t for t in tasks
        if t.planned_end and t.planned_end < now and t.status not in ("completed", "skipped", "failed")
    ]
    if overdue and total > 0:
        overdue_factor = len(overdue) / total
        schedule_drift_pct = max(schedule_drift_pct, overdue_factor * 0.5)

    # --- Effort drift ---
    effort_drift_pct = 0.0
    if planned_completed_hours > 0:
        effort_drift_pct = (actual_completed_hours - planned_completed_hours) / planned_completed_hours

    # --- Scope drift (vs version 1 snapshot) ---
    scope_drift_pct = 0.0
    v1_result = await db.execute(
        select(PlanVersion).where(
            PlanVersion.plan_id == plan.id,
            PlanVersion.version == 1,
        )
    )
    v1 = v1_result.scalar_one_or_none()
    if v1:
        v1_task_count = len(v1.snapshot.get("tasks", []))
        if v1_task_count > 0:
            scope_drift_pct = abs(total - v1_task_count) / v1_task_count

    # --- Composite score ---
    overall_drift = (
        0.5 * abs(schedule_drift_pct) +
        0.3 * abs(effort_drift_pct) +
        0.2 * scope_drift_pct
    )

    severity = _classify_severity(overall_drift)

    metric = DriftMetric(
        plan_id=plan.id,
        schedule_drift_pct=round(schedule_drift_pct * 100, 2),
        scope_drift_pct=round(scope_drift_pct * 100, 2),
        effort_drift_pct=round(effort_drift_pct * 100, 2),
        overall_drift=round(overall_drift * 100, 2),
        severity=severity,
        details={
            "overdue_task_count": len(overdue),
            "completed_task_count": len(completed),
            "total_task_count": total,
        },
    )
    db.add(metric)
    await db.flush()
    return metric


def _classify_severity(overall: float) -> str:
    if overall >= THRESHOLD_CRITICAL:
        return "critical"
    elif overall >= THRESHOLD_HIGH:
        return "high"
    elif overall >= THRESHOLD_MEDIUM:
        return "medium"
    elif overall >= THRESHOLD_LOW:
        return "low"
    return "none"
