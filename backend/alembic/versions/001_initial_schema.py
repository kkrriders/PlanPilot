"""Initial schema

Revision ID: 001
Revises:
Create Date: 2026-04-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # users
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("email", sa.String(), nullable=False, unique=True),
        sa.Column("hashed_pw", sa.String(), nullable=False),
        sa.Column("full_name", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # plans
    op.create_table(
        "plans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("goal", sa.String(), nullable=False),
        sa.Column("constraints", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("status", sa.String(), nullable=False, server_default="draft"),
        sa.Column("risk_score", sa.Float(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("current_version", sa.Integer(), server_default="1"),
        sa.Column("job_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('draft','generating','active','paused','completed','failed')", name="ck_plan_status"),
        sa.CheckConstraint("risk_score BETWEEN 0 AND 1", name="ck_plan_risk"),
        sa.CheckConstraint("confidence BETWEEN 0 AND 1", name="ck_plan_confidence"),
    )

    # plan_versions
    op.create_table(
        "plan_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("plan_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("plans.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("snapshot", postgresql.JSONB(), nullable=False),
        sa.Column("trigger", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("trigger IN ('initial','drift','user_edit','checkpoint')", name="ck_version_trigger"),
        sa.UniqueConstraint("plan_id", "version", name="uq_plan_version"),
    )

    # tasks
    op.create_table(
        "tasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("plan_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("plans.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("category", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("priority", sa.Integer(), server_default="3"),
        sa.Column("estimated_hours", sa.Float(), nullable=True),
        sa.Column("actual_hours", sa.Float(), nullable=True),
        sa.Column("planned_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("planned_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actual_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actual_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("assigned_to", sa.String(), nullable=True),
        sa.Column("is_on_critical_path", sa.Boolean(), server_default="false"),
        sa.Column("metadata", postgresql.JSONB(), server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('pending','in_progress','blocked','completed','skipped','failed')", name="ck_task_status"),
        sa.CheckConstraint("priority BETWEEN 1 AND 5", name="ck_task_priority"),
    )

    # task_dependencies
    op.create_table(
        "task_dependencies",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("plan_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("plans.id", ondelete="CASCADE"), nullable=False),
        sa.Column("predecessor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("successor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("dep_type", sa.String(), server_default="finish_to_start"),
        sa.Column("lag_hours", sa.Float(), server_default="0"),
        sa.CheckConstraint("predecessor_id != successor_id", name="ck_no_self_dep"),
        sa.UniqueConstraint("predecessor_id", "successor_id", name="uq_task_dep"),
    )

    # execution_logs
    op.create_table(
        "execution_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("plan_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("plans.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_type", sa.String(), nullable=False),
        sa.Column("prev_status", sa.String(), nullable=True),
        sa.Column("new_status", sa.String(), nullable=True),
        sa.Column("pct_complete", sa.Float(), server_default="0"),
        sa.Column("note", sa.String(), nullable=True),
        sa.Column("logged_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("logged_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("event_type IN ('started','progress','blocked','completed','failed','comment')", name="ck_log_event_type"),
        sa.CheckConstraint("pct_complete BETWEEN 0 AND 100", name="ck_log_pct"),
    )

    # checkpoints
    op.create_table(
        "checkpoints",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("plan_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("plans.id", ondelete="CASCADE"), nullable=False),
        sa.Column("label", sa.String(), nullable=False),
        sa.Column("snapshot", postgresql.JSONB(), nullable=False),
        sa.Column("is_auto", sa.Boolean(), server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # drift_metrics
    op.create_table(
        "drift_metrics",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("plan_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("plans.id", ondelete="CASCADE"), nullable=False),
        sa.Column("computed_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("schedule_drift_pct", sa.Float(), nullable=True),
        sa.Column("scope_drift_pct", sa.Float(), nullable=True),
        sa.Column("effort_drift_pct", sa.Float(), nullable=True),
        sa.Column("overall_drift", sa.Float(), nullable=True),
        sa.Column("severity", sa.String(), server_default="none"),
        sa.Column("details", postgresql.JSONB(), server_default="{}"),
        sa.CheckConstraint("severity IN ('none','low','medium','high','critical')", name="ck_drift_severity"),
    )

    # drift_events
    op.create_table(
        "drift_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("plan_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("plans.id", ondelete="CASCADE"), nullable=False),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tasks.id"), nullable=True),
        sa.Column("drift_metric_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("drift_metrics.id"), nullable=True),
        sa.Column("trigger_type", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("was_replanned", sa.Boolean(), server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("trigger_type IN ('delay','block','scope_change','resource_change','failure')", name="ck_drift_event_type"),
    )

    # adaptive_weights
    op.create_table(
        "adaptive_weights",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("scope", sa.String(), nullable=False),
        sa.Column("scope_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("key", sa.String(), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("confidence", sa.Float(), server_default="0.5"),
        sa.Column("sample_count", sa.Integer(), server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("scope IN ('global','user','plan_category')", name="ck_weight_scope"),
        sa.UniqueConstraint("scope", "scope_id", "key", name="uq_weight"),
    )

    # feedback_logs
    op.create_table(
        "feedback_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("plan_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("plans.id", ondelete="CASCADE"), nullable=False),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tasks.id"), nullable=True),
        sa.Column("field", sa.String(), nullable=False),
        sa.Column("old_value", sa.String(), nullable=True),
        sa.Column("new_value", sa.String(), nullable=True),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("source IN ('user','auto_drift','auto_completion')", name="ck_feedback_source"),
    )

    # Indexes
    op.create_index("idx_tasks_plan_id", "tasks", ["plan_id", "version"])
    op.create_index("idx_exec_logs_task", "execution_logs", ["task_id", "logged_at"])
    op.create_index("idx_drift_metrics_plan", "drift_metrics", ["plan_id", "computed_at"])
    op.create_index("idx_task_deps_successor", "task_dependencies", ["successor_id"])


def downgrade() -> None:
    op.drop_table("feedback_logs")
    op.drop_table("adaptive_weights")
    op.drop_table("drift_events")
    op.drop_table("drift_metrics")
    op.drop_table("checkpoints")
    op.drop_table("execution_logs")
    op.drop_table("task_dependencies")
    op.drop_table("tasks")
    op.drop_table("plan_versions")
    op.drop_table("plans")
    op.drop_table("users")
