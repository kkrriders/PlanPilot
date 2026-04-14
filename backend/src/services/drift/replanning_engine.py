"""
Replanning engine: LLM-powered replan with frozen completed tasks.
"""
import json
import uuid
import difflib
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.plan import Plan, PlanVersion
from src.models.task import Task, TaskDependency
from src.models.drift import DriftMetric, DriftEvent
from src.services.llm.groq_provider import sonnet
from src.services.llm.prompt_templates import REPLAN_SYSTEM, REPLAN_USER
from src.services.planning.dag_builder import build_dag
from src.services.planning.plan_evaluator import evaluate_plan


async def generate_replan_preview(plan_id: str, db: AsyncSession) -> dict:
    """
    Generates a replan and returns a diff preview WITHOUT writing to DB.
    """
    plan, completed_tasks, remaining_tasks, latest_drift, drift_events = await _load_plan_state(plan_id, db)

    new_raw_tasks, reasoning = await _call_llm_replan(plan, completed_tasks, remaining_tasks, latest_drift, drift_events)

    # Deduplicate against completed tasks
    frozen_names = {t.name.lower() for t in completed_tasks}
    new_raw_tasks = _deduplicate_tasks(new_raw_tasks, frozen_names)

    scheduled_new, new_critical_path_ids = build_dag(new_raw_tasks)
    risk_score, confidence, _, _ = await evaluate_plan(
        plan.goal, plan.constraints, scheduled_new, new_critical_path_ids
    )

    current_remaining_names = {t.name for t in remaining_tasks}
    new_names = {t.name for t in scheduled_new}

    added = [t for t in scheduled_new if t.name not in current_remaining_names]
    removed = [t for t in remaining_tasks if t.name not in new_names]
    modified = [
        t for t in scheduled_new
        if t.name in current_remaining_names
        and any(
            abs((t.estimated_hours or 0) - (r.estimated_hours or 0)) > 0.5
            for r in remaining_tasks if r.name == t.name
        )
    ]

    return {
        "added": [{"name": t.name, "estimated_hours": t.estimated_hours, "category": t.category} for t in added],
        "removed": [{"name": t.name, "id": str(t.id)} for t in removed],
        "modified": [{"name": t.name, "new_estimated_hours": t.estimated_hours} for t in modified],
        "new_critical_path": [t.name for t in scheduled_new if t.id in new_critical_path_ids],
        "new_risk_score": round(risk_score, 3),
        "new_confidence": round(confidence, 3),
        "reasoning": reasoning,
        "_scheduled_new": scheduled_new,  # internal, stripped before returning to API
        "_new_critical_path_ids": new_critical_path_ids,
    }


async def apply_replan(plan_id: str, preview: dict, db: AsyncSession) -> PlanVersion:
    """
    Commits the replan: creates new tasks, marks removed tasks as skipped,
    increments plan version, and creates a PlanVersion snapshot.
    """
    plan_result = await db.execute(select(Plan).where(Plan.id == plan_id))
    plan = plan_result.scalar_one_or_none()
    if not plan:
        raise ValueError(f"Plan {plan_id} not found")

    # Use copies to avoid mutating the caller's dict
    scheduled_new = preview["_scheduled_new"]
    new_critical_path_ids = preview["_new_critical_path_ids"]

    # Mark removed tasks as skipped
    removed_names = {r["name"] for r in preview["removed"]}
    if removed_names:
        task_result = await db.execute(
            select(Task).where(Task.plan_id == plan.id, Task.name.in_(removed_names))
        )
        for task in task_result.scalars().all():
            task.status = "skipped"

    new_version = plan.current_version + 1
    plan.current_version = new_version

    # Persist new tasks
    for st in scheduled_new:
        task = Task(
            id=uuid.UUID(st.id),
            plan_id=plan.id,
            version=new_version,
            name=st.name,
            description=st.description,
            category=st.category,
            priority=st.priority,
            estimated_hours=st.estimated_hours,
            assigned_to=st.assigned_to,
            planned_start=st.planned_start,
            planned_end=st.planned_end,
            is_on_critical_path=st.is_on_critical_path,
        )
        db.add(task)

    await db.flush()

    for st in scheduled_new:
        for pred_id in st.dependencies:
            dep = TaskDependency(
                plan_id=plan.id,
                predecessor_id=uuid.UUID(pred_id),
                successor_id=uuid.UUID(st.id),
            )
            db.add(dep)

    # Mark drift events as replanned
    from sqlalchemy import update
    await db.execute(
        update(DriftEvent)
        .where(DriftEvent.plan_id == plan.id, DriftEvent.was_replanned == False)  # noqa: E712
        .values(was_replanned=True)
    )

    # Build snapshot
    snapshot = {
        "tasks": [
            {"id": st.id, "name": st.name, "estimated_hours": st.estimated_hours,
             "is_on_critical_path": st.is_on_critical_path,
             "planned_start": st.planned_start.isoformat(), "planned_end": st.planned_end.isoformat()}
            for st in scheduled_new
        ],
        "critical_path_ids": new_critical_path_ids,
        "risk_score": preview["new_risk_score"],
        "replan_reasoning": preview.get("reasoning", ""),
    }

    version = PlanVersion(
        plan_id=plan.id,
        version=new_version,
        snapshot=snapshot,
        trigger="drift",
    )
    db.add(version)

    plan.risk_score = preview["new_risk_score"]
    plan.confidence = preview["new_confidence"]

    await db.commit()
    return version


async def _load_plan_state(plan_id: str, db: AsyncSession):
    plan_result = await db.execute(select(Plan).where(Plan.id == plan_id))
    plan = plan_result.scalar_one_or_none()
    if not plan:
        raise ValueError(f"Plan {plan_id} not found")

    task_result = await db.execute(select(Task).where(Task.plan_id == plan.id))
    all_tasks = task_result.scalars().all()

    completed = [t for t in all_tasks if t.status in ("completed", "failed")]
    remaining = [t for t in all_tasks if t.status not in ("completed", "failed", "skipped")]

    drift_result = await db.execute(
        select(DriftMetric)
        .where(DriftMetric.plan_id == plan.id)
        .order_by(DriftMetric.computed_at.desc())
        .limit(1)
    )
    latest_drift = drift_result.scalar_one_or_none()

    event_result = await db.execute(
        select(DriftEvent)
        .where(DriftEvent.plan_id == plan.id, DriftEvent.was_replanned == False)  # noqa: E712
        .limit(10)
    )
    drift_events = event_result.scalars().all()

    return plan, completed, remaining, latest_drift, drift_events


async def _call_llm_replan(plan, completed_tasks, remaining_tasks, latest_drift, drift_events) -> tuple[list[dict], str]:
    completed_summary = [{"name": t.name, "actual_hours": t.actual_hours} for t in completed_tasks]
    remaining_summary = [
        {"name": t.name, "status": t.status, "estimated_hours": t.estimated_hours}
        for t in remaining_tasks
    ]
    events_summary = [{"type": e.trigger_type, "desc": e.description} for e in drift_events]

    prompt = REPLAN_USER.format(
        goal=plan.goal,
        constraints=json.dumps(plan.constraints, indent=2),
        schedule_drift_pct=latest_drift.schedule_drift_pct if latest_drift else 0,
        effort_drift_pct=latest_drift.effort_drift_pct if latest_drift else 0,
        severity=latest_drift.severity if latest_drift else "unknown",
        completed_tasks=json.dumps(completed_summary, indent=2),
        remaining_tasks=json.dumps(remaining_summary, indent=2),
        drift_events=json.dumps(events_summary, indent=2),
    )

    result = await sonnet.complete_json(REPLAN_SYSTEM, prompt, max_tokens=4096)
    return result.get("tasks", []), result.get("reasoning", "")


def _deduplicate_tasks(new_tasks: list[dict], frozen_names: set[str]) -> list[dict]:
    """Remove tasks that are near-duplicates of completed (frozen) tasks."""
    clean = []
    for task in new_tasks:
        name_lower = task["name"].lower()
        is_duplicate = any(
            difflib.SequenceMatcher(None, name_lower, frozen).ratio() > 0.85
            for frozen in frozen_names
        )
        if not is_duplicate:
            clean.append(task)
    return clean
