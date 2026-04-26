"""
Adaptive learning: updates per-user estimation weights after plan completion.
Requires minimum 3 completed plans before weights activate.
"""
from sqlalchemy import select, and_, func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
import uuid

from src.models.plan import Plan
from src.models.task import Task
from src.models.learning import AdaptiveWeight, FeedbackLog

EMA_ALPHA = 0.3  # weight for new observation in exponential moving average
MIN_SAMPLES = 3  # minimum observations before weights activate

# Industry-average estimation ratios (actual/estimated) used as cold-start priors.
# Sourced from published software project research (CHAOS Report, industry surveys).
INDUSTRY_BENCHMARKS: dict[str, float] = {
    "category_bias_dev":      1.35,  # developers underestimate by ~35%
    "category_bias_test":     1.10,
    "category_bias_research": 1.50,  # research tasks most underestimated
    "category_bias_design":   1.15,
    "category_bias_deploy":   1.40,
    "category_bias_planning": 1.05,
    "category_bias_review":   1.00,
}


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
    user_keys = {w.key for w in weights}

    rows = [
        {
            "key": w.key,
            "value": round(w.value, 3),
            "confidence": round(w.confidence, 3),
            "sample_count": w.sample_count,
            "active": w.sample_count >= MIN_SAMPLES,
            "source": "user",
        }
        for w in weights
    ]

    # Fill in industry benchmarks for categories the user hasn't yet learned
    for key, value in INDUSTRY_BENCHMARKS.items():
        if key not in user_keys:
            rows.append({
                "key": key,
                "value": round(value, 3),
                "confidence": 0.3,
                "sample_count": 0,
                "active": True,  # benchmarks always active as cold-start priors
                "source": "industry",
            })

    return rows


async def _update_weight(
    scope: str,
    scope_id: uuid.UUID,
    key: str,
    observed_value: float,
    db: AsyncSession,
) -> None:
    # Atomic UPSERT prevents race condition when two workers update the same user concurrently
    t = AdaptiveWeight.__table__
    stmt = (
        pg_insert(AdaptiveWeight)
        .values(scope=scope, scope_id=scope_id, key=key, value=observed_value, confidence=0.1, sample_count=1)
        .on_conflict_do_update(
            constraint="uq_weight",
            set_={
                "value": (1 - EMA_ALPHA) * t.c.value + EMA_ALPHA * observed_value,
                "sample_count": t.c.sample_count + 1,
                "confidence": func.least(0.95, (t.c.sample_count + 1.0) / 10.0),
                "updated_at": func.now(),
            },
        )
    )
    await db.execute(stmt)
