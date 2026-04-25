import asyncio
from celery.exceptions import Ignore, Retry
from src.workers.celery_app import celery_app
from src.core.database import AsyncSessionLocal
from src.services.planning.task_planner import generate_plan


@celery_app.task(name="src.workers.planning_tasks.generate_plan_async", queue="planning", bind=True, max_retries=2)
def generate_plan_async(self, plan_id: str, mode: str = "accurate"):
    """Async plan generation triggered on POST /plans/{id}/generate."""
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(_run(plan_id, mode))
    except (SystemExit, KeyboardInterrupt, Ignore, Retry):
        raise
    except Exception as exc:
        raise self.retry(exc=exc, countdown=10)
    finally:
        loop.close()


async def _run(plan_id: str, mode: str):
    async with AsyncSessionLocal() as db:
        await generate_plan(plan_id, db, mode=mode)
