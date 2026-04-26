from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid

from src.core.database import get_db
from src.core.dependencies import get_current_user
from src.models.user import User
from src.models.plan import Plan, PlanVersion
from src.models.task import Task, TaskDependency
from src.schemas.plan import PlanCreate, PlanUpdate, PlanOut, PlanVersionOut, DagOut
from src.workers.planning_tasks import generate_plan_async
from src.workers.celery_app import celery_app
from src.core.limiter import limiter
from src.services.learning.adaptive_weights import update_weights_after_completion
from src.models.drift import DriftEvent

router = APIRouter(prefix="/plans", tags=["plans"])

# Allowed manual status transitions via PATCH (generating/failed set by system only)
_ALLOWED_STATUS_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"active"},
    "active": {"paused", "completed"},
    "paused": {"active", "completed"},
    "failed": {"draft"},
}


@router.post("", response_model=PlanOut, status_code=201)
async def create_plan(
    body: PlanCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    plan = Plan(
        user_id=current_user.id,
        title=body.title,
        goal=body.goal,
        constraints=body.constraints.model_dump(),
        status="draft",
    )
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return plan


@router.post("/{plan_id}/generate", response_model=PlanOut)
@limiter.limit("10/minute")
async def trigger_generate(
    request: Request,
    plan_id: uuid.UUID,
    mode: str = Query(default="accurate", pattern="^(fast|accurate|debate)$"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # SELECT FOR UPDATE prevents double-trigger race condition
    result = await db.execute(
        select(Plan)
        .where(Plan.id == plan_id, Plan.user_id == current_user.id)
        .with_for_update()
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    # If a generation is in flight, revoke it before starting a new one
    if plan.status == "generating" and plan.job_id:
        celery_app.control.revoke(plan.job_id, terminate=True)
    job = generate_plan_async.delay(str(plan.id), mode)
    plan.status = "generating"
    plan.job_id = job.id
    await db.commit()
    await db.refresh(plan)
    return plan


@router.get("", response_model=list[PlanOut])
async def list_plans(
    limit: int = 20,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    limit = min(limit, 100)
    result = await db.execute(
        select(Plan)
        .where(Plan.user_id == current_user.id, Plan.status != "completed")
        .order_by(Plan.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return result.scalars().all()


@router.get("/archived")
async def list_archived_plans(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns completed plans with summary stats for the history page."""
    result = await db.execute(
        select(Plan)
        .where(Plan.user_id == current_user.id, Plan.status == "completed")
        .order_by(Plan.updated_at.desc())
    )
    plans = result.scalars().all()

    summaries = []
    for plan in plans:
        task_result = await db.execute(
            select(Task).where(Task.plan_id == plan.id, Task.version == plan.current_version)
        )
        tasks = task_result.scalars().all()

        total_tasks = len(tasks)
        completed_tasks = sum(1 for t in tasks if t.status == "completed")
        estimated_hours = sum(t.estimated_hours or 0 for t in tasks)
        actual_hours = sum(t.actual_hours or 0 for t in tasks if t.actual_hours)

        version_result = await db.execute(
            select(PlanVersion).where(PlanVersion.plan_id == plan.id).order_by(PlanVersion.version)
        )
        versions = version_result.scalars().all()

        drift_result = await db.execute(
            select(DriftEvent).where(DriftEvent.plan_id == plan.id)
        )
        drift_count = len(drift_result.scalars().all())

        summaries.append({
            "id": str(plan.id),
            "title": plan.title,
            "goal": plan.goal,
            "created_at": plan.created_at.isoformat(),
            "completed_at": plan.updated_at.isoformat(),
            "risk_score": plan.risk_score,
            "confidence": plan.confidence,
            "total_tasks": total_tasks,
            "completed_tasks": completed_tasks,
            "completion_rate": round(completed_tasks / total_tasks * 100) if total_tasks else 0,
            "estimated_hours": round(estimated_hours, 1),
            "actual_hours": round(actual_hours, 1) if actual_hours else None,
            "versions": len(versions),
            "drift_events": drift_count,
        })

    return summaries


@router.post("/{plan_id}/complete")
async def complete_plan(
    plan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Marks a plan as completed and archives it."""
    plan = await _get_plan_or_404(plan_id, current_user.id, db)
    if plan.status not in ("active", "paused"):
        raise HTTPException(status_code=400, detail=f"Cannot complete a plan with status '{plan.status}'")
    plan.status = "completed"
    await db.commit()
    await update_weights_after_completion(str(plan_id), db)
    return {"status": "completed", "plan_id": str(plan_id)}


@router.get("/{plan_id}", response_model=PlanOut)
async def get_plan(
    plan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    plan = await _get_plan_or_404(plan_id, current_user.id, db)
    return plan


@router.patch("/{plan_id}", response_model=PlanOut)
async def update_plan(
    plan_id: uuid.UUID,
    body: PlanUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    plan = await _get_plan_or_404(plan_id, current_user.id, db)
    if body.title:
        plan.title = body.title
    if body.goal:
        plan.goal = body.goal
    if body.status:
        allowed = _ALLOWED_STATUS_TRANSITIONS.get(plan.status, set())
        if body.status not in allowed:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot transition plan from '{plan.status}' to '{body.status}'",
            )
        plan.status = body.status
    if body.constraints:
        plan.constraints = body.constraints.model_dump()
    await db.commit()
    await db.refresh(plan)
    return plan


@router.delete("/{plan_id}", status_code=204)
async def delete_plan(
    plan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    plan = await _get_plan_or_404(plan_id, current_user.id, db)
    await db.delete(plan)
    await db.commit()


@router.get("/{plan_id}/status")
async def get_plan_status(
    plan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    plan = await _get_plan_or_404(plan_id, current_user.id, db)
    return {"status": plan.status, "job_id": plan.job_id, "risk_score": plan.risk_score, "confidence": plan.confidence}


@router.get("/{plan_id}/versions", response_model=list[PlanVersionOut])
async def list_versions(
    plan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_plan_or_404(plan_id, current_user.id, db)
    result = await db.execute(
        select(PlanVersion).where(PlanVersion.plan_id == plan_id).order_by(PlanVersion.version)
    )
    return result.scalars().all()


@router.get("/{plan_id}/history")
async def get_task_history(
    plan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns all tasks from previous versions grouped by version number."""
    plan = await _get_plan_or_404(plan_id, current_user.id, db)
    if plan.current_version <= 1:
        return []

    task_result = await db.execute(
        select(Task)
        .where(Task.plan_id == plan_id, Task.version < plan.current_version)
        .order_by(Task.version.desc(), Task.planned_start)
    )
    tasks = task_result.scalars().all()

    grouped: dict[int, list] = {}
    for t in tasks:
        grouped.setdefault(t.version, []).append({
            "id": str(t.id),
            "name": t.name,
            "category": t.category,
            "status": t.status,
            "estimated_hours": t.estimated_hours,
            "actual_hours": t.actual_hours,
            "assigned_to": t.assigned_to,
            "is_on_critical_path": t.is_on_critical_path,
            "version": t.version,
        })

    return [{"version": v, "tasks": grouped[v]} for v in sorted(grouped.keys(), reverse=True)]


@router.get("/{plan_id}/reasoning")
async def get_plan_reasoning(
    plan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns the debate log and reasoning from the latest plan version."""
    plan = await _get_plan_or_404(plan_id, current_user.id, db)
    result = await db.execute(
        select(PlanVersion)
        .where(PlanVersion.plan_id == plan_id, PlanVersion.version == plan.current_version)
    )
    version = result.scalar_one_or_none()
    if not version or not version.snapshot:
        return {"debate_log": [], "mode": "accurate", "planner_reasoning": ""}
    snap = version.snapshot
    return {
        "debate_log": snap.get("debate_log", []),
        "mode": snap.get("mode", "accurate"),
        "planner_reasoning": snap.get("planner_reasoning", ""),
        "iterations_used": snap.get("iterations_used", 1),
        "critic_score": snap.get("critic_score", 0),
    }


@router.post("/{plan_id}/report")
async def generate_stakeholder_report(
    plan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate a prose stakeholder report using LLM."""
    from src.services.llm.groq_provider import sonnet

    plan = await _get_plan_or_404(plan_id, current_user.id, db)

    task_result = await db.execute(
        select(Task).where(Task.plan_id == plan_id, Task.version == plan.current_version)
    )
    tasks = task_result.scalars().all()

    total = len(tasks)
    completed = sum(1 for t in tasks if t.status == "completed")
    in_progress = sum(1 for t in tasks if t.status == "in_progress")
    blocked = sum(1 for t in tasks if t.status == "blocked")
    pending = sum(1 for t in tasks if t.status == "pending")
    estimated_hours = sum(t.estimated_hours or 0 for t in tasks)
    actual_hours = sum(t.actual_hours or 0 for t in tasks if t.actual_hours)
    critical_names = [t.name for t in tasks if t.is_on_critical_path]
    blocked_names = [t.name for t in tasks if t.status == "blocked"]

    prompt = f"""Generate a stakeholder status report for the following project.

PROJECT: {plan.title}
GOAL: {plan.goal}
STATUS: {plan.status.upper()}

TASK METRICS:
- Total tasks: {total}
- Completed: {completed} ({round(completed / total * 100) if total else 0}%)
- In Progress: {in_progress}
- Blocked: {blocked}
- Pending: {pending}

HOURS:
- Estimated total: {estimated_hours:.1f}h
- Actual logged: {actual_hours:.1f}h

RISK & CONFIDENCE:
- Risk score: {(plan.risk_score or 0) * 100:.0f}%
- AI confidence: {(plan.confidence or 0) * 100:.0f}%

CRITICAL PATH TASKS:
{chr(10).join(f"- {t}" for t in critical_names) if critical_names else "- None identified"}

BLOCKED TASKS:
{chr(10).join(f"- {t}" for t in blocked_names) if blocked_names else "- None currently blocked"}

Write a professional 4-section report using markdown headers:
## Executive Summary
## Progress Overview
## Risks & Concerns
## Recommended Next Steps

Be concise (under 400 words), honest about risks, and do not invent data not provided above."""

    system = "You are a senior project manager writing a concise status report for stakeholders. Be professional and honest."
    try:
        report_text = await sonnet.complete(system, prompt, max_tokens=800)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Report generation failed: {exc}")

    return {"report": report_text, "plan_id": str(plan_id)}


@router.get("/{plan_id}/dag", response_model=DagOut)
async def get_dag(
    plan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    plan = await _get_plan_or_404(plan_id, current_user.id, db)

    task_result = await db.execute(
        select(Task).where(Task.plan_id == plan_id, Task.version == plan.current_version)
    )
    tasks = task_result.scalars().all()

    dep_result = await db.execute(select(TaskDependency).where(TaskDependency.plan_id == plan_id))
    deps = dep_result.scalars().all()

    nodes = [
        {
            "id": str(t.id),
            "data": {
                "label": t.name, "category": t.category, "status": t.status,
                "estimated_hours": t.estimated_hours, "priority": t.priority,
                "is_on_critical_path": t.is_on_critical_path,
                "description": t.description,
                "assigned_to": t.assigned_to,
                "hours_pessimistic": (t.metadata_ or {}).get("hours_pessimistic"),
                "is_external_block": (t.metadata_ or {}).get("is_external_block", False),
                "external_block_reason": (t.metadata_ or {}).get("external_block_reason"),
                "rating": (t.metadata_ or {}).get("rating"),
            },
            "type": "taskNode",
        }
        for t in tasks
    ]

    edges = [
        {"id": str(d.id), "source": str(d.predecessor_id), "target": str(d.successor_id)}
        for d in deps
    ]

    critical_path = [str(t.id) for t in tasks if t.is_on_critical_path]

    return DagOut(nodes=nodes, edges=edges, critical_path=critical_path)


async def _get_plan_or_404(plan_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> Plan:
    result = await db.execute(
        select(Plan).where(Plan.id == plan_id, Plan.user_id == user_id)
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan
