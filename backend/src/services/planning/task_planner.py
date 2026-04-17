"""
Orchestrates: adaptive weights → LLM decomposition → DAG → evaluation → store.
"""
import json
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid

from src.services.llm.groq_provider import sonnet
from src.services.llm.prompt_templates import DECOMPOSITION_SYSTEM, DECOMPOSITION_USER
from src.services.planning.dag_builder import build_dag
from src.services.planning.constraint_engine import validate_constraints
from src.services.planning.plan_evaluator import evaluate_plan
from src.models.plan import Plan, PlanVersion
from src.models.task import Task, TaskDependency
from src.models.learning import AdaptiveWeight
from src.models.team import TeamMember


async def generate_plan(plan_id: str, db: AsyncSession) -> None:
    """
    Full planning pipeline. Called from Celery task.
    Updates the plan in-place: sets tasks, risk score, and status.
    """
    result = await db.execute(select(Plan).where(Plan.id == plan_id))
    plan = result.scalar_one_or_none()
    if not plan:
        return

    constraints = plan.constraints

    # Load adaptive weights and team members
    adaptive_context = await _load_adaptive_context(str(plan.user_id), db)
    team_context = await _load_team_context(plan_id, db)

    # Call LLM
    prompt = DECOMPOSITION_USER.format(
        goal=plan.goal,
        deadline_days=constraints.get("deadline_days", "not specified"),
        team_size=constraints.get("team_size", "not specified"),
        budget_usd=constraints.get("budget_usd", "not specified"),
        tech_stack=", ".join(constraints.get("tech_stack", [])) or "not specified",
        notes=constraints.get("notes", "none"),
        team_context=team_context,
        adaptive_context=adaptive_context,
    )

    try:
        llm_result = await sonnet.complete_json(DECOMPOSITION_SYSTEM, prompt, max_tokens=4096)
        raw_tasks = llm_result["tasks"]
    except Exception as e:
        plan.status = "failed"
        plan.metadata_ = {"error": str(e)} if hasattr(plan, "metadata_") else {}
        await db.commit()
        return

    # Apply adaptive weight bias adjustments
    raw_tasks = _apply_adaptive_bias(raw_tasks, await _get_weights(str(plan.user_id), db))

    # Build DAG + schedule
    try:
        scheduled_tasks, critical_path_ids = build_dag(raw_tasks)
    except ValueError as e:
        plan.status = "failed"
        await db.commit()
        return

    # Constraint validation
    constraint_result = validate_constraints(
        constraints,
        [{"estimated_hours": t.estimated_hours} for t in scheduled_tasks],
        critical_path_hours=sum(t.estimated_hours for t in scheduled_tasks if t.id in critical_path_ids),
    )

    # Risk evaluation
    risk_score, confidence, risk_factors, recommendations = await evaluate_plan(
        plan.goal, constraints, scheduled_tasks, critical_path_ids
    )

    # Bump version so new tasks are scoped separately from historical ones
    # (old tasks are preserved as-is for history; the DAG endpoint filters by current_version)
    if plan.current_version > 1 or (await db.execute(
        select(Task).where(Task.plan_id == plan.id).limit(1)
    )).scalar_one_or_none() is not None:
        plan.current_version += 1

    # Persist tasks
    task_orm_map: dict[str, Task] = {}
    for st in scheduled_tasks:
        task = Task(
            id=uuid.UUID(st.id),
            plan_id=plan.id,
            version=plan.current_version,
            name=st.name,
            description=st.description,
            category=st.category,
            priority=st.priority,
            estimated_hours=st.estimated_hours,
            assigned_to=st.assigned_to,
            planned_start=st.planned_start,
            planned_end=st.planned_end,
            is_on_critical_path=st.is_on_critical_path,
            metadata_={
                "risk_factors": risk_factors if st.is_on_critical_path else [],
            },
        )
        db.add(task)
        task_orm_map[st.id] = task

    await db.flush()

    # Persist dependencies
    for st in scheduled_tasks:
        for pred_id in st.dependencies:
            dep = TaskDependency(
                plan_id=plan.id,
                predecessor_id=uuid.UUID(pred_id),
                successor_id=uuid.UUID(st.id),
            )
            db.add(dep)

    # Build snapshot for version history
    snapshot = {
        "tasks": [
            {
                "id": st.id, "name": st.name, "category": st.category,
                "estimated_hours": st.estimated_hours, "priority": st.priority,
                "is_on_critical_path": st.is_on_critical_path,
                "planned_start": st.planned_start.isoformat(),
                "planned_end": st.planned_end.isoformat(),
                "dependencies": st.dependencies,
            }
            for st in scheduled_tasks
        ],
        "critical_path_ids": critical_path_ids,
        "risk_score": risk_score,
        "confidence": confidence,
        "risk_factors": risk_factors,
        "recommendations": recommendations,
        "constraint_violations": constraint_result.violations,
        "constraint_warnings": constraint_result.warnings,
    }

    version = PlanVersion(
        plan_id=plan.id,
        version=plan.current_version,
        snapshot=snapshot,
        trigger="initial" if plan.current_version == 1 else "user_edit",
    )
    db.add(version)

    # Update plan
    plan.status = "active"
    plan.risk_score = risk_score
    plan.confidence = confidence

    await db.commit()


async def _load_team_context(plan_id: str, db: AsyncSession) -> str:
    result = await db.execute(
        select(TeamMember).where(TeamMember.plan_id == uuid.UUID(plan_id))
    )
    members = result.scalars().all()
    if not members:
        return "No team members defined — leave assigned_to as null."
    lines = []
    for m in members:
        skills_str = ", ".join(m.skills) if m.skills else "general"
        lines.append(f"- {m.name} ({m.role}): {skills_str}")
    return "\n".join(lines)


async def _load_adaptive_context(user_id: str, db: AsyncSession) -> str:
    weights = await _get_weights(user_id, db)
    if not weights:
        return "No historical data yet — use standard estimates."
    lines = []
    for w in weights:
        if w.sample_count >= 3:
            bias = (w.value - 1.0) * 100
            direction = "over" if bias > 0 else "under"
            lines.append(f"- Historically {direction}estimates '{w.key}' tasks by {abs(bias):.0f}%")
    return "\n".join(lines) if lines else "Insufficient historical data for adjustments."


async def _get_weights(user_id: str, db: AsyncSession) -> list[AdaptiveWeight]:
    result = await db.execute(
        select(AdaptiveWeight).where(
            AdaptiveWeight.scope == "user",
            AdaptiveWeight.scope_id == uuid.UUID(user_id),
        )
    )
    return result.scalars().all()


def _apply_adaptive_bias(tasks: list[dict], weights: list[AdaptiveWeight]) -> list[dict]:
    """Adjust estimated_hours based on learned category biases."""
    bias_map: dict[str, float] = {}
    for w in weights:
        if w.key.startswith("category_bias_") and w.sample_count >= 3:
            category = w.key.replace("category_bias_", "")
            bias_map[category] = w.value  # multiplier

    if not bias_map:
        return tasks

    adjusted = []
    for task in tasks:
        t = dict(task)
        category = t.get("category", "")
        if category in bias_map:
            t["estimated_hours"] = round((t.get("estimated_hours", 8.0) * bias_map[category]), 1)
        adjusted.append(t)
    return adjusted
