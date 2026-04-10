"""Add compliance fields to execution_logs

Revision ID: 002
Revises: 001
Create Date: 2026-04-10
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("execution_logs", sa.Column("evidence_url", sa.String(), nullable=True))
    op.add_column("execution_logs", sa.Column("compliance_flags", postgresql.JSONB(), nullable=True, server_default="[]"))


def downgrade() -> None:
    op.drop_column("execution_logs", "compliance_flags")
    op.drop_column("execution_logs", "evidence_url")
