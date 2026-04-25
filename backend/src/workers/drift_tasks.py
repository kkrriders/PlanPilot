import asyncio
from src.workers.celery_app import celery_app
from src.core.database import AsyncSessionLocal
from src.services.drift.detector import compute_drift
from src.models.plan import Plan
from sqlalchemy import select


@celery_app.task(name="src.workers.drift_tasks.compute_drift_all_active", queue="drift")
def compute_drift_all_active():
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(_run())
    finally:
        loop.close()


async def _run():
    # Fetch plan IDs first, then process each in its own session to prevent
    # identity map corruption after rollback.
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Plan.id).where(Plan.status == "active"))
        plan_ids = [str(row[0]) for row in result.all()]

    for plan_id in plan_ids:
        async with AsyncSessionLocal() as plan_db:
            try:
                await compute_drift(plan_id, plan_db)
                await plan_db.commit()
            except Exception:
                await plan_db.rollback()


@celery_app.task(name="src.workers.drift_tasks.compute_drift_single", queue="drift", bind=True, max_retries=2)
def compute_drift_single(self, plan_id: str):
    loop = None
    try:
        loop = asyncio.new_event_loop()
        loop.run_until_complete(_run_single(plan_id))
    except Exception as exc:
        raise self.retry(exc=exc, countdown=10)
    finally:
        if loop is not None:
            loop.close()


async def _run_single(plan_id: str):
    async with AsyncSessionLocal() as db:
        await compute_drift(plan_id, db)
        await db.commit()
