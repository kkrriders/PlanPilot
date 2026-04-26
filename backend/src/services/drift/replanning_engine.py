"""
Replanning coordinator: loads plan state, runs DriftAgent → RiskAgent → ReplannerAgent,
then builds a diff preview and optionally commits to DB.
"""
import logging
import uuid
import difflib
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

from src.agents.shared_memory import SharedMemory
from src.agents.drift_agent import DriftAgent
from src.agents.risk_agent import RiskAgent
from src.agents.replanner_agent import ReplannerAgent
from src.models.plan import Plan, PlanVersion
from src.models.task import Task, TaskDependency
from src.models.drift import DriftMetric, DriftEvent
from src.services.planning.dag_builder import build_dag


async def generate_replan_preview(plan_id: str, db: AsyncSession) -> dict:
    """
    Runs DriftAgent → RiskAgent → ReplannerAgent and returns a diff preview
    WITHOUT writing anything to DB.
    """
    drift_agent = DriftAgent()
    risk_agent = RiskAgent()
    replanner_agent = ReplannerAgent()

    plan, completed_tasks, remaining_tasks, latest_drift, drift_events = await _load_plan_state(plan_id, db)

    memory = SharedMemory(
        plan_id=plan_id,
        goal=plan.goal,
        constraints=plan.constraints,
    )

    # Step 1: DriftAgent — diagnose why drift happened
    metrics = _build_metrics_dict(latest_drift)
    completed_summary = [{"name": t.name, "actual_hours": t.actual_hours} for t in completed_tasks]
    events_summary = [{"type": e.trigger_type, "desc": e.description} for e in drift_events]

    drift_result = await drift_agent.act(
        {
            "metrics": metrics,
            "drift_events": events_summary,
            "completed_tasks": completed_summary,
        },
        memory,
    )

    # Step 2: RiskAgent — evaluate risk of replanning with current state
    remaining_summary = [
        {"name": t.name, "status": t.status, "estimated_hours": t.estimated_hours}
        for t in remaining_tasks
    ]
    risk_result = await risk_agent.act({"tasks": remaining_summary}, memory)

    # Step 3: ReplannerAgent — generate revised tasks
    replan_result = await replanner_agent.act(
        {
            "completed_tasks": completed_summary,
            "remaining_tasks": remaining_summary,
        },
        memory,
    )

    new_raw_tasks = replan_result.output.get("tasks", [])
    reasoning = replan_result.reasoning

    if not new_raw_tasks:
        raise ValueError("ReplannerAgent returned no tasks")

    # Deduplicate against completed tasks
    frozen_names = {t.name.lower() for t in completed_tasks}
    new_raw_tasks = _deduplicate_tasks(new_raw_tasks, frozen_names)

    scheduled_new, new_critical_path_ids = build_dag(new_raw_tasks)

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
        "modified": [
            {
                "name": t.name,
                "old_estimated_hours": next(
                    (r.estimated_hours for r in remaining_tasks if r.name == t.name), None
                ),
                "new_estimated_hours": t.estimated_hours,
            }
            for t in modified
        ],
        "new_critical_path": [t.name for t in scheduled_new if t.id in new_critical_path_ids],
        "new_risk_score": round(float(risk_result.output.get("risk_score", 0.5)), 3),
        "new_confidence": round(replan_result.confidence, 3),
        "reasoning": reasoning,
        "drift_analysis": drift_result.output,
        "_scheduled_new": scheduled_new,
        "_new_critical_path_ids": new_critical_path_ids,
    }


async def apply_replan(plan_id: str, preview: dict, db: AsyncSession) -> PlanVersion:
    """Commits the replan preview to DB."""
    plan_result = await db.execute(select(Plan).where(Plan.id == plan_id))
    plan = plan_result.scalar_one_or_none()
    if not plan:
        raise ValueError(f"Plan {plan_id} not found")

    scheduled_new = preview["_scheduled_new"]
    new_critical_path_ids = preview["_new_critical_path_ids"]

    removed_names = {r["name"] for r in preview["removed"]}
    if removed_names:
        task_result = await db.execute(
            select(Task).where(
                Task.plan_id == plan.id,
                Task.version == plan.current_version,
                Task.name.in_(removed_names),
            )
        )
        for task in task_result.scalars().all():
            task.status = "skipped"

    new_version = plan.current_version + 1
    plan.current_version = new_version

    for st in scheduled_new:
        db.add(Task(
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
        ))

    await db.flush()

    for st in scheduled_new:
        for pred_id in st.dependencies:
            db.add(TaskDependency(
                plan_id=plan.id,
                predecessor_id=uuid.UUID(pred_id),
                successor_id=uuid.UUID(st.id),
            ))

    await db.execute(
        update(DriftEvent)
        .where(DriftEvent.plan_id == plan.id, DriftEvent.was_replanned == False)  # noqa: E712
        .values(was_replanned=True)
    )

    snapshot = {
        "tasks": [
            {
                "id": st.id, "name": st.name, "estimated_hours": st.estimated_hours,
                "is_on_critical_path": st.is_on_critical_path,
                "planned_start": st.planned_start.isoformat(),
                "planned_end": st.planned_end.isoformat(),
            }
            for st in scheduled_new
        ],
        "critical_path_ids": new_critical_path_ids,
        "risk_score": preview["new_risk_score"],
        "replan_reasoning": preview.get("reasoning", ""),
        "drift_analysis": preview.get("drift_analysis", {}),
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

    task_result = await db.execute(
        select(Task).where(Task.plan_id == plan.id, Task.version == plan.current_version)
    )
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


def _build_metrics_dict(drift: DriftMetric | None) -> dict:
    if not drift:
        return {}
    return {
        "schedule_drift_pct": drift.schedule_drift_pct or 0,
        "effort_drift_pct": drift.effort_drift_pct or 0,
        "scope_drift_pct": drift.scope_drift_pct or 0,
        "overall_drift": drift.overall_drift or 0,
        "severity": drift.severity or "none",
        "details": drift.details or {},
    }


def _deduplicate_tasks(new_tasks: list[dict], frozen_names: set[str]) -> list[dict]:
    kept = []
    for task in new_tasks:
        name_lower = task["name"].lower()
        match = next(
            (f for f in frozen_names
             if difflib.SequenceMatcher(None, name_lower, f).ratio() > 0.85),
            None,
        )
        if match:
            logger.debug("Dedup dropped '%s' — similar to completed task '%s'", task["name"], match)
        else:
            kept.append(task)
    return kept
