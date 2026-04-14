from pydantic import BaseModel, Field
from typing import Literal
import uuid
from datetime import datetime

PlanStatus = Literal["draft", "generating", "active", "paused", "completed", "failed"]


class PlanConstraints(BaseModel):
    deadline_days: int | None = None
    team_size: int | None = None
    budget_usd: float | None = None
    tech_stack: list[str] = []
    notes: str | None = None


class PlanCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    goal: str = Field(min_length=10, max_length=2000)
    constraints: PlanConstraints = PlanConstraints()


class PlanUpdate(BaseModel):
    title: str | None = None
    goal: str | None = None
    status: PlanStatus | None = None
    constraints: PlanConstraints | None = None


class PlanOut(BaseModel):
    id: uuid.UUID
    title: str
    goal: str
    constraints: dict
    status: str
    risk_score: float | None
    confidence: float | None
    current_version: int
    job_id: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PlanVersionOut(BaseModel):
    id: uuid.UUID
    plan_id: uuid.UUID
    version: int
    trigger: str
    snapshot: dict
    created_at: datetime

    model_config = {"from_attributes": True}


class DagOut(BaseModel):
    nodes: list[dict]
    edges: list[dict]
    critical_path: list[str]
