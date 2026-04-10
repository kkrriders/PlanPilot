from __future__ import annotations
from typing import TYPE_CHECKING
from sqlalchemy import String, Float, Integer, DateTime, ForeignKey, func, CheckConstraint, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB
import uuid
from src.core.database import Base

if TYPE_CHECKING:
    from src.models.user import User
    from src.models.task import Task
    from src.models.drift import DriftMetric


class Plan(Base):
    __tablename__ = "plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    goal: Mapped[str] = mapped_column(String, nullable=False)
    constraints: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String, nullable=False, default="draft")
    risk_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    current_version: Mapped[int] = mapped_column(Integer, default=1)
    job_id: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("status IN ('draft','generating','active','paused','completed','failed')", name="ck_plan_status"),
        CheckConstraint("risk_score BETWEEN 0 AND 1", name="ck_plan_risk"),
        CheckConstraint("confidence BETWEEN 0 AND 1", name="ck_plan_confidence"),
    )

    user: Mapped[User] = relationship("User", back_populates="plans")
    tasks: Mapped[list[Task]] = relationship("Task", back_populates="plan", lazy="noload")
    versions: Mapped[list[PlanVersion]] = relationship("PlanVersion", back_populates="plan", lazy="noload")
    drift_metrics: Mapped[list[DriftMetric]] = relationship("DriftMetric", back_populates="plan", lazy="noload")


class PlanVersion(Base):
    __tablename__ = "plan_versions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plan_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("plans.id", ondelete="CASCADE"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)
    trigger: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint("trigger IN ('initial','drift','user_edit','checkpoint')", name="ck_version_trigger"),
    )

    plan: Mapped[Plan] = relationship("Plan", back_populates="versions")
