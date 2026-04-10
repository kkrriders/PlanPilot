from __future__ import annotations
from typing import TYPE_CHECKING
from sqlalchemy import String, Float, DateTime, ForeignKey, func, CheckConstraint, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB
import uuid
from src.core.database import Base

if TYPE_CHECKING:
    from src.models.task import Task


class ExecutionLog(Base):
    __tablename__ = "execution_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    plan_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("plans.id", ondelete="CASCADE"), nullable=False)
    event_type: Mapped[str] = mapped_column(String, nullable=False)
    prev_status: Mapped[str | None] = mapped_column(String, nullable=True)
    new_status: Mapped[str | None] = mapped_column(String, nullable=True)
    pct_complete: Mapped[float] = mapped_column(Float, default=0.0)
    note: Mapped[str | None] = mapped_column(String, nullable=True)
    logged_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    logged_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint(
            "event_type IN ('started','progress','blocked','completed','failed','comment')",
            name="ck_log_event_type",
        ),
        CheckConstraint("pct_complete BETWEEN 0 AND 100", name="ck_log_pct"),
    )

    task: Mapped[Task] = relationship("Task", back_populates="execution_logs")


class Checkpoint(Base):
    __tablename__ = "checkpoints"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plan_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("plans.id", ondelete="CASCADE"), nullable=False)
    label: Mapped[str] = mapped_column(String, nullable=False)
    snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)
    is_auto: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
