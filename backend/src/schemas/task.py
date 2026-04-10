from pydantic import BaseModel
import uuid
from datetime import datetime


class TaskCreate(BaseModel):
    name: str
    description: str | None = None
    category: str | None = None
    priority: int = 3
    estimated_hours: float | None = None
    assigned_to: str | None = None
    dependency_ids: list[uuid.UUID] = []


class TaskUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: str | None = None
    priority: int | None = None
    estimated_hours: float | None = None
    actual_hours: float | None = None
    assigned_to: str | None = None


class TaskOut(BaseModel):
    id: uuid.UUID
    plan_id: uuid.UUID
    version: int
    name: str
    description: str | None
    category: str | None
    status: str
    priority: int
    estimated_hours: float | None
    actual_hours: float | None
    planned_start: datetime | None
    planned_end: datetime | None
    actual_start: datetime | None
    actual_end: datetime | None
    assigned_to: str | None
    is_on_critical_path: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class DependencyCreate(BaseModel):
    predecessor_id: uuid.UUID
    dep_type: str = "finish_to_start"
    lag_hours: float = 0.0
