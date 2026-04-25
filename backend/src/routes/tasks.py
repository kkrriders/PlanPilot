from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid

from src.core.database import get_db
from src.core.dependencies import get_current_user
from src.models.user import User
from src.models.plan import Plan
from src.models.task import Task, TaskDependency
from src.schemas.task import TaskCreate, TaskUpdate, TaskOut, DependencyCreate
from src.utils.graph import has_cycle
from src.workers.drift_tasks import compute_drift_single

_DRIFT_TRIGGER_STATUSES = {"completed", "failed", "blocked"}

router = APIRouter(prefix="/plans/{plan_id}/tasks", tags=["tasks"])


@router.get("", response_model=list[TaskOut])
async def list_tasks(
    plan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    plan = await _check_plan_ownership(plan_id, current_user.id, db)
    result = await db.execute(
        select(Task)
        .where(Task.plan_id == plan_id, Task.version == plan.current_version)
        .order_by(Task.planned_start)
    )
    return result.scalars().all()


@router.post("", response_model=TaskOut, status_code=201)
async def create_task(
    plan_id: uuid.UUID,
    body: TaskCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    plan = await _check_plan_ownership(plan_id, current_user.id, db)
    task = Task(
        plan_id=plan_id,
        version=plan.current_version,
        name=body.name,
        description=body.description,
        category=body.category,
        priority=body.priority,
        estimated_hours=body.estimated_hours,
        assigned_to=body.assigned_to,
    )
    db.add(task)
    await db.flush()

    for pred_id in body.dependency_ids:
        await _add_dependency_safe(plan_id, pred_id, task.id, db, plan.current_version)

    await db.commit()
    await db.refresh(task)
    return task


@router.patch("/{task_id}", response_model=TaskOut)
async def update_task(
    plan_id: uuid.UUID,
    task_id: uuid.UUID,
    body: TaskUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_plan_ownership(plan_id, current_user.id, db)
    task = await _get_task_or_404(task_id, plan_id, db)

    prev_status = task.status
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(task, field, value)

    await db.commit()
    await db.refresh(task)

    if body.status and body.status != prev_status and body.status in _DRIFT_TRIGGER_STATUSES:
        compute_drift_single.apply_async(args=[str(plan_id)], countdown=2)

    return task


@router.delete("/{task_id}", status_code=204)
async def delete_task(
    plan_id: uuid.UUID,
    task_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    plan = await _check_plan_ownership(plan_id, current_user.id, db)
    task = await _get_task_or_404(task_id, plan_id, db)

    if plan.status == "active":
        task.status = "skipped"
    else:
        await db.delete(task)
    await db.commit()


@router.post("/{task_id}/dependencies", status_code=201)
async def add_dependency(
    plan_id: uuid.UUID,
    task_id: uuid.UUID,
    body: DependencyCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    plan = await _check_plan_ownership(plan_id, current_user.id, db)
    dep = await _add_dependency_safe(plan_id, body.predecessor_id, task_id, db, plan.current_version)
    await db.commit()
    return {"id": str(dep.id), "predecessor_id": str(dep.predecessor_id), "successor_id": str(dep.successor_id)}


@router.delete("/{task_id}/dependencies/{dep_id}", status_code=204)
async def remove_dependency(
    plan_id: uuid.UUID,
    task_id: uuid.UUID,
    dep_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_plan_ownership(plan_id, current_user.id, db)
    result = await db.execute(select(TaskDependency).where(TaskDependency.id == dep_id))
    dep = result.scalar_one_or_none()
    if dep:
        await db.delete(dep)
        await db.commit()


async def _add_dependency_safe(plan_id, pred_id, succ_id, db, current_version: int = None):
    """Add dependency with cycle check scoped to current plan version."""
    dep_result = await db.execute(select(TaskDependency).where(TaskDependency.plan_id == plan_id))
    existing_edges = [(str(d.predecessor_id), str(d.successor_id)) for d in dep_result.scalars().all()]

    task_query = select(Task).where(Task.plan_id == plan_id)
    if current_version is not None:
        task_query = task_query.where(Task.version == current_version)
    task_result = await db.execute(task_query)
    all_tasks = task_result.scalars().all()
    node_ids = [str(t.id) for t in all_tasks]

    test_edges = existing_edges + [(str(pred_id), str(succ_id))]
    if has_cycle(node_ids, test_edges):
        raise HTTPException(status_code=400, detail="Adding this dependency would create a cycle")

    dep = TaskDependency(plan_id=plan_id, predecessor_id=pred_id, successor_id=succ_id)
    db.add(dep)
    await db.flush()
    return dep


async def _check_plan_ownership(plan_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> Plan:
    result = await db.execute(select(Plan).where(Plan.id == plan_id, Plan.user_id == user_id))
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan


async def _get_task_or_404(task_id: uuid.UUID, plan_id: uuid.UUID, db: AsyncSession) -> Task:
    result = await db.execute(select(Task).where(Task.id == task_id, Task.plan_id == plan_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task
