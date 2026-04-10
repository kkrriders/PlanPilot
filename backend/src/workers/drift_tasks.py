import asyncio
from src.workers.celery_app import celery_app
from src.core.database import AsyncSessionLocal
from src.services.drift.detector import compute_drift
from src.models.plan import Plan
from sqlalchemy import select


@celery_app.task(name="src.workers.drift_tasks.compute_drift_all_active", queue="drift")
def compute_drift_all_active():
    asyncio.run(_run())


async def _run():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Plan).where(Plan.status == "active"))
        plans = result.scalars().all()
        for plan in plans:
            try:
                await compute_drift(str(plan.id), db)
                await db.commit()
            except Exception:
                await db.rollback()


@celery_app.task(name="src.workers.drift_tasks.compute_drift_single", queue="drift")
def compute_drift_single(plan_id: str):
    asyncio.run(_run_single(plan_id))


async def _run_single(plan_id: str):
    async with AsyncSessionLocal() as db:
        await compute_drift(plan_id, db)
        await db.commit()
