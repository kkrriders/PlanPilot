from pydantic import BaseModel, Field
import uuid
from datetime import datetime


class LogEventCreate(BaseModel):
    event_type: str
    pct_complete: float = Field(ge=0, le=100, default=0)
    note: str | None = None
    new_status: str | None = None


class ExecutionLogOut(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    plan_id: uuid.UUID
    event_type: str
    prev_status: str | None
    new_status: str | None
    pct_complete: float
    note: str | None
    logged_at: datetime

    model_config = {"from_attributes": True}


class CheckpointCreate(BaseModel):
    label: str


class CheckpointOut(BaseModel):
    id: uuid.UUID
    plan_id: uuid.UUID
    label: str
    is_auto: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class TimelineEntry(BaseModel):
    task_id: str
    name: str
    category: str | None
    status: str
    is_on_critical_path: bool
    planned_start: datetime | None
    planned_end: datetime | None
    actual_start: datetime | None
    actual_end: datetime | None
    pct_complete: float
    is_delayed: bool
