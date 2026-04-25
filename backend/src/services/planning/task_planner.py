"""
Planning coordinator: loads DB context, runs the multi-agent orchestrator,
then persists the result. Agents live in src/agents/.
"""
import logging
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from src.agents.multi_agent_orchestrator import MultiAgentOrchestrator, PlanningMode
from src.services.planning.dag_builder import build_dag
from src.services.planning.constraint_engine import validate_constraints
from src.models.plan import Plan, PlanVersion
from src.models.task import Task, TaskDependency
from src.models.learning import AdaptiveWeight
from src.models.team import TeamMember

logger = logging.getLogger(__name__)


async def generate_plan(plan_id: str, db: AsyncSession, mode: PlanningMode = "accurate") -> None:
    result = await db.execute(select(Plan).where(Plan.id == plan_id))
    plan = result.scalar_one_or_none()
    if not plan:
        raise ValueError(f"Plan {plan_id} not found")

    constraints = plan.constraints
    adaptive_context = await _load_adaptive_context(str(plan.user_id), db)
    team_context = await _load_team_context(plan_id, db)

    orchestrator = MultiAgentOrchestrator(mode=mode)
    try:
        orch_result = await orchestrator.run_planning(
            plan_id=plan_id,
            goal=plan.goal,
            constraints=constraints,
            adaptive_context=adaptive_context,
            team_context=team_context,
        )
    except Exception:
        logger.exception("Orchestrator failed for plan_id=%s", plan_id)
        plan.status = "failed"
        await db.commit()
        raise

    raw_tasks = orch_result.tasks
    if not raw_tasks:
        logger.warning("Orchestrator returned no tasks for plan_id=%s (mode=%s)", plan_id, mode)
        plan.status = "failed"
        await db.commit()
        return

    weights = await _get_weights(str(plan.user_id), db)
    raw_tasks = _apply_adaptive_bias(raw_tasks, weights)

    try:
        scheduled_tasks, critical_path_ids = build_dag(raw_tasks)
    except ValueError:
        logger.exception("DAG build failed for plan_id=%s", plan_id)
        plan.status = "failed"
        await db.commit()
        return

    constraint_result = validate_constraints(
        constraints,
        [{"estimated_hours": t.estimated_hours} for t in scheduled_tasks],
        critical_path_hours=sum(
            t.estimated_hours for t in scheduled_tasks if t.id in critical_path_ids
        ),
    )
    if constraint_result.violations:
        logger.warning(
            "Constraint violations for plan_id=%s: %s", plan_id, constraint_result.violations
        )

    # Always bump version on regeneration — version 1 is reserved for the first successful plan.
    plan.current_version += 1

    for st in scheduled_tasks:
        db.add(Task(
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
            metadata_={"risk_factors": orch_result.risk_factors if st.is_on_critical_path else []},
        ))

    await db.flush()

    for st in scheduled_tasks:
        for pred_id in st.dependencies:
            db.add(TaskDependency(
                plan_id=plan.id,
                predecessor_id=uuid.UUID(pred_id),
                successor_id=uuid.UUID(st.id),
            ))

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
        "risk_score": orch_result.risk_score,
        "confidence": orch_result.confidence,
        "risk_factors": orch_result.risk_factors,
        "recommendations": orch_result.recommendations,
        "critic_score": orch_result.critic_score,
        "iterations_used": orch_result.iterations_used,
        "planner_reasoning": orch_result.planner_reasoning,
        "constraint_violations": constraint_result.violations,
        "constraint_warnings": constraint_result.warnings,
    }

    db.add(PlanVersion(
        plan_id=plan.id,
        version=plan.current_version,
        snapshot=snapshot,
        trigger="initial" if plan.current_version == 1 else "user_edit",
    ))

    plan.status = "active"
    plan.risk_score = orch_result.risk_score
    plan.confidence = orch_result.confidence

    await db.commit()


async def _load_team_context(plan_id: str, db: AsyncSession) -> str:
    result = await db.execute(
        select(TeamMember).where(TeamMember.plan_id == uuid.UUID(plan_id))
    )
    members = result.scalars().all()
    if not members:
        return "No team members defined — leave assigned_to as null."
    lines = [
        f"- {m.name} ({m.role}): {', '.join(m.skills) if m.skills else 'general'}"
        for m in members
    ]
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
    bias_map: dict[str, float] = {
        w.key.replace("category_bias_", ""): w.value
        for w in weights
        if w.key.startswith("category_bias_") and w.sample_count >= 3
    }
    if not bias_map:
        return tasks
    adjusted = []
    for task in tasks:
        t = dict(task)
        category = t.get("category", "")
        if category in bias_map:
            raw_hours = t.get("estimated_hours") or 8.0
            t["estimated_hours"] = max(0.5, round(raw_hours * bias_map[category], 1))
        adjusted.append(t)
    return adjusted
