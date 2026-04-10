import asyncio
from src.workers.celery_app import celery_app
from src.core.database import AsyncSessionLocal
from src.services.execution.progress_monitor import scan_for_delays


@celery_app.task(name="src.workers.execution_tasks.scan_delays", queue="monitoring")
def scan_delays():
    asyncio.run(_run())


async def _run():
    async with AsyncSessionLocal() as db:
        count = await scan_for_delays(db)
        return {"delay_events_created": count}
