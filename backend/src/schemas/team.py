from pydantic import BaseModel, Field
import uuid
from datetime import datetime


class TeamMemberCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    role: str = Field(min_length=1, max_length=80)
    skills: list[str] = Field(default_factory=list)
    color: str = "#3b82f6"


class TeamMemberUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    skills: list[str] | None = None
    color: str | None = None


class TeamMemberOut(BaseModel):
    id: uuid.UUID
    plan_id: uuid.UUID
    name: str
    role: str
    skills: list[str]
    color: str
    created_at: datetime

    model_config = {"from_attributes": True}
