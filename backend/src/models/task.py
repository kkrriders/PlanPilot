from __future__ import annotations
from typing import TYPE_CHECKING
from sqlalchemy import String, Float, Integer, DateTime, ForeignKey, func, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB
import uuid
from src.core.database import Base

if TYPE_CHECKING:
    from src.models.plan import Plan
    from src.models.execution import ExecutionLog


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plan_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("plans.id", ondelete="CASCADE"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    category: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    priority: Mapped[int] = mapped_column(Integer, default=3)
    estimated_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    actual_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    planned_start: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    planned_end: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    actual_start: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    actual_end: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    assigned_to: Mapped[str | None] = mapped_column(String, nullable=True)
    is_on_critical_path: Mapped[bool] = mapped_column(default=False)
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("status IN ('pending','in_progress','blocked','completed','skipped','failed')", name="ck_task_status"),
        CheckConstraint("priority BETWEEN 1 AND 5", name="ck_task_priority"),
    )

    plan: Mapped[Plan] = relationship("Plan", back_populates="tasks")
    execution_logs: Mapped[list[ExecutionLog]] = relationship("ExecutionLog", back_populates="task", lazy="noload")

    # Dependencies where this task is the successor
    predecessor_links: Mapped[list["TaskDependency"]] = relationship(
        "TaskDependency", foreign_keys="TaskDependency.successor_id", back_populates="successor", lazy="noload"
    )
    # Dependencies where this task is the predecessor
    successor_links: Mapped[list["TaskDependency"]] = relationship(
        "TaskDependency", foreign_keys="TaskDependency.predecessor_id", back_populates="predecessor", lazy="noload"
    )


class TaskDependency(Base):
    __tablename__ = "task_dependencies"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plan_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("plans.id", ondelete="CASCADE"), nullable=False)
    predecessor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    successor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    dep_type: Mapped[str] = mapped_column(String, default="finish_to_start")
    lag_hours: Mapped[float] = mapped_column(Float, default=0.0)

    __table_args__ = (
        CheckConstraint("predecessor_id != successor_id", name="ck_no_self_dep"),
        CheckConstraint("dep_type IN ('finish_to_start','start_to_start','finish_to_finish')", name="ck_dep_type"),
    )

    predecessor: Mapped[Task] = relationship("Task", foreign_keys=[predecessor_id], back_populates="successor_links")
    successor: Mapped[Task] = relationship("Task", foreign_keys=[successor_id], back_populates="predecessor_links")
