from __future__ import annotations
from typing import TYPE_CHECKING
from sqlalchemy import String, Float, DateTime, ForeignKey, func, CheckConstraint, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB
import uuid
from src.core.database import Base

if TYPE_CHECKING:
    from src.models.plan import Plan


class DriftMetric(Base):
    __tablename__ = "drift_metrics"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plan_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("plans.id", ondelete="CASCADE"), nullable=False)
    computed_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    schedule_drift_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    scope_drift_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    effort_drift_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    overall_drift: Mapped[float | None] = mapped_column(Float, nullable=True)
    severity: Mapped[str] = mapped_column(String, default="none")
    details: Mapped[dict] = mapped_column(JSONB, default=dict)

    __table_args__ = (
        CheckConstraint("severity IN ('none','low','medium','high','critical')", name="ck_drift_severity"),
    )

    plan: Mapped[Plan] = relationship("Plan", back_populates="drift_metrics")
    events: Mapped[list[DriftEvent]] = relationship("DriftEvent", back_populates="drift_metric", lazy="noload")


class DriftEvent(Base):
    __tablename__ = "drift_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plan_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("plans.id", ondelete="CASCADE"), nullable=False)
    task_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=True)
    drift_metric_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("drift_metrics.id"), nullable=True)
    trigger_type: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    was_replanned: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint(
            "trigger_type IN ('delay','block','scope_change','resource_change','failure')",
            name="ck_drift_event_type",
        ),
    )

    drift_metric: Mapped[DriftMetric] = relationship("DriftMetric", back_populates="events")
