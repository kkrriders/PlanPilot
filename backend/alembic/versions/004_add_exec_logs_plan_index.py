"""Add index on execution_logs.plan_id for compliance/timeline queries

Revision ID: 004
Revises: 003
Create Date: 2026-04-14
"""
from alembic import op

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("idx_exec_logs_plan", "execution_logs", ["plan_id", "logged_at"])


def downgrade() -> None:
    op.drop_index("idx_exec_logs_plan", table_name="execution_logs")
