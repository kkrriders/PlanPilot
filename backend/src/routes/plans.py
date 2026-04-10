from fastapi import APIRouter, Depends, HTTPException, status
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

router = APIRouter(prefix="/plans", tags=["plans"])


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
async def trigger_generate(
    plan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    plan = await _get_plan_or_404(plan_id, current_user.id, db)
    if plan.status not in ("draft", "failed"):
        raise HTTPException(status_code=409, detail="Plan is already generating or active")
    plan.status = "generating"
    await db.commit()
    job = generate_plan_async.delay(str(plan.id))
    plan.job_id = job.id
    await db.commit()
    await db.refresh(plan)
    return plan


@router.get("", response_model=list[PlanOut])
async def list_plans(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Plan).where(Plan.user_id == current_user.id).order_by(Plan.created_at.desc())
    )
    return result.scalars().all()


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
    if body.status:
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


@router.get("/{plan_id}/dag", response_model=DagOut)
async def get_dag(
    plan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    plan = await _get_plan_or_404(plan_id, current_user.id, db)

    task_result = await db.execute(select(Task).where(Task.plan_id == plan_id))
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
