"""
Adaptive learning: updates per-user estimation weights after plan completion.
Requires minimum 3 completed plans before weights activate.
"""
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
import uuid

from src.models.plan import Plan
from src.models.task import Task
from src.models.learning import AdaptiveWeight, FeedbackLog

EMA_ALPHA = 0.3  # weight for new observation in exponential moving average
MIN_SAMPLES = 3  # minimum plans before weights activate


async def update_weights_after_completion(plan_id: str, db: AsyncSession) -> None:
    """Called when a plan reaches 'completed' status."""
    plan_result = await db.execute(select(Plan).where(Plan.id == plan_id))
    plan = plan_result.scalar_one_or_none()
    if not plan:
        return

    user_id = plan.user_id

    # Get completed tasks with both estimated and actual hours
    task_result = await db.execute(
        select(Task).where(
            Task.plan_id == plan.id,
            Task.status == "completed",
            Task.estimated_hours != None,  # noqa: E711
            Task.actual_hours != None,  # noqa: E711
        )
    )
    tasks = task_result.scalars().all()
    if not tasks:
        return

    # Compute overall effort bias (actual/estimated ratio)
    overall_ratios = [t.actual_hours / t.estimated_hours for t in tasks if t.estimated_hours > 0]
    if overall_ratios:
        overall_bias = sum(overall_ratios) / len(overall_ratios)
        await _update_weight(
            scope="user",
            scope_id=user_id,
            key="effort_estimation_bias",
            observed_value=overall_bias,
            db=db,
        )

    # Compute per-category bias
    category_ratios: dict[str, list[float]] = {}
    for task in tasks:
        if task.category and task.estimated_hours > 0:
            ratio = task.actual_hours / task.estimated_hours
            category_ratios.setdefault(task.category, []).append(ratio)

    for category, ratios in category_ratios.items():
        avg_ratio = sum(ratios) / len(ratios)
        await _update_weight(
            scope="user",
            scope_id=user_id,
            key=f"category_bias_{category}",
            observed_value=avg_ratio,
            db=db,
        )

    # Log feedback
    for task in tasks:
        if task.estimated_hours and task.actual_hours:
            feedback = FeedbackLog(
                plan_id=plan.id,
                task_id=task.id,
                field="estimated_hours",
                old_value=str(task.estimated_hours),
                new_value=str(task.actual_hours),
                source="auto_completion",
            )
            db.add(feedback)

    await db.commit()


async def get_user_weights(user_id: uuid.UUID, db: AsyncSession) -> list[dict]:
    result = await db.execute(
        select(AdaptiveWeight).where(
            AdaptiveWeight.scope == "user",
            AdaptiveWeight.scope_id == user_id,
        )
    )
    weights = result.scalars().all()
    return [
        {
            "key": w.key,
            "value": round(w.value, 3),
            "confidence": round(w.confidence, 3),
            "sample_count": w.sample_count,
            "active": w.sample_count >= MIN_SAMPLES,
        }
        for w in weights
    ]


async def _update_weight(
    scope: str,
    scope_id: uuid.UUID,
    key: str,
    observed_value: float,
    db: AsyncSession,
) -> None:
    result = await db.execute(
        select(AdaptiveWeight).where(
            and_(
                AdaptiveWeight.scope == scope,
                AdaptiveWeight.scope_id == scope_id,
                AdaptiveWeight.key == key,
            )
        )
    )
    weight = result.scalar_one_or_none()

    if weight:
        # Exponential moving average
        weight.value = (1 - EMA_ALPHA) * weight.value + EMA_ALPHA * observed_value
        weight.sample_count += 1
        weight.confidence = min(0.95, weight.sample_count / 10)
    else:
        weight = AdaptiveWeight(
            scope=scope,
            scope_id=scope_id,
            key=key,
            value=observed_value,
            confidence=0.1,
            sample_count=1,
        )
        db.add(weight)
