from celery import Celery
from celery.schedules import crontab
from src.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "planpilot",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=[
        "src.workers.planning_tasks",
        "src.workers.execution_tasks",
        "src.workers.drift_tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_routes={
        "src.workers.planning_tasks.*": {"queue": "planning"},
        "src.workers.execution_tasks.*": {"queue": "monitoring"},
        "src.workers.drift_tasks.*": {"queue": "drift"},
    },
    beat_schedule={
        "scan-delays-every-5-minutes": {
            "task": "src.workers.execution_tasks.scan_delays",
            "schedule": crontab(minute="*/5"),
        },
        "compute-drift-every-15-minutes": {
            "task": "src.workers.drift_tasks.compute_drift_all_active",
            "schedule": crontab(minute="*/15"),
        },
    },
)
