from pydantic import BaseModel
import uuid
from datetime import datetime


class DriftMetricOut(BaseModel):
    id: uuid.UUID
    plan_id: uuid.UUID
    computed_at: datetime
    schedule_drift_pct: float | None
    scope_drift_pct: float | None
    effort_drift_pct: float | None
    overall_drift: float | None
    severity: str
    details: dict

    model_config = {"from_attributes": True}


class DriftEventOut(BaseModel):
    id: uuid.UUID
    plan_id: uuid.UUID
    task_id: uuid.UUID | None
    trigger_type: str
    description: str | None
    was_replanned: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ReplanPreview(BaseModel):
    added: list[dict]
    removed: list[dict]
    modified: list[dict]
    new_critical_path: list[str]
    new_risk_score: float
    new_confidence: float
