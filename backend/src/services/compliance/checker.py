"""
Compliance checker — enforces strict execution integrity rules.
Errors block the action; warnings are stored as flags but allowed through.
"""
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Optional
import uuid
import re

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from src.models.task import Task, TaskDependency


@dataclass
class ComplianceViolation:
    code: str       # e.g. "DEPENDENCY_GATE"
    severity: str   # "error" | "warning"
    message: str

    def to_dict(self) -> dict:
        return asdict(self)


# Minimum note length for any event
_NOTE_MIN = 10
# Minimum note length to substitute evidence on completion
_COMPLETION_NOTE_MIN = 50
# Fraction of estimated_hours below which velocity is suspicious
_VELOCITY_THRESHOLD = 0.20


def _looks_like_url(value: str) -> bool:
    return bool(re.match(r"https?://\S+", value.strip()))


def _looks_like_commit(value: str) -> bool:
    v = value.strip().lower()
    return bool(re.fullmatch(r"[0-9a-f]{7,40}", v))


async def run_compliance_checks(
    task_id: uuid.UUID,
    event_type: str,
    note: Optional[str],
    evidence_url: Optional[str],
    db: AsyncSession,
) -> list[ComplianceViolation]:
    violations: list[ComplianceViolation] = []

    task_result = await db.execute(select(Task).where(Task.id == task_id))
    task = task_result.scalar_one_or_none()
    if not task:
        return violations

    # ── 1. NOTE_REQUIRED ────────────────────────────────────────────────────
    note_text = (note or "").strip()
    if len(note_text) < _NOTE_MIN:
        violations.append(ComplianceViolation(
            code="NOTE_REQUIRED",
            severity="error",
            message=f"A note of at least {_NOTE_MIN} characters is required for every event.",
        ))

    # ── 2. DEPENDENCY_GATE ──────────────────────────────────────────────────
    if event_type in ("started", "completed"):
        dep_result = await db.execute(
            select(TaskDependency).where(TaskDependency.successor_id == task_id)
        )
        deps = dep_result.scalars().all()
        if deps:
            pred_ids = [d.predecessor_id for d in deps]
            pred_result = await db.execute(
                select(Task).where(
                    Task.id.in_(pred_ids),
                    Task.status.not_in(["completed", "skipped", "failed"]),
                )
            )
            blocked_by = pred_result.scalars().all()
            if blocked_by:
                names = ", ".join(f'"{p.name}"' for p in blocked_by[:3])
                violations.append(ComplianceViolation(
                    code="DEPENDENCY_GATE",
                    severity="error",
                    message=f"Cannot proceed — predecessor tasks not yet completed: {names}",
                ))

    # ── 3. NO_SKIP_GATE ─────────────────────────────────────────────────────
    if event_type == "completed" and not task.actual_start:
        violations.append(ComplianceViolation(
            code="NO_SKIP_GATE",
            severity="error",
            message="Task must be started (logged as 'started') before it can be completed.",
        ))

    # ── 4. EVIDENCE_REQUIRED (completion only) ──────────────────────────────
    if event_type == "completed":
        has_evidence = (
            (evidence_url and (_looks_like_url(evidence_url) or _looks_like_commit(evidence_url)))
            or len(note_text) >= _COMPLETION_NOTE_MIN
        )
        if not has_evidence:
            violations.append(ComplianceViolation(
                code="EVIDENCE_REQUIRED",
                severity="error",
                message=(
                    "Completion requires a PR/commit URL in the evidence field, "
                    f"or a detailed note of at least {_COMPLETION_NOTE_MIN} characters."
                ),
            ))

    # ── 5. VELOCITY_ANOMALY (warning only, does not block) ──────────────────
    if event_type == "completed" and task.actual_start and task.estimated_hours:
        elapsed = (datetime.now(timezone.utc) - task.actual_start).total_seconds() / 3600
        if elapsed < task.estimated_hours * _VELOCITY_THRESHOLD:
            violations.append(ComplianceViolation(
                code="VELOCITY_ANOMALY",
                severity="warning",
                message=(
                    f"Completed in {elapsed:.1f}h vs {task.estimated_hours}h estimated "
                    f"({elapsed / task.estimated_hours * 100:.0f}% of estimate). Flagged for review."
                ),
            ))

    return violations


def split_violations(
    violations: list[ComplianceViolation],
) -> tuple[list[ComplianceViolation], list[ComplianceViolation]]:
    """Returns (errors, warnings)."""
    errors = [v for v in violations if v.severity == "error"]
    warnings = [v for v in violations if v.severity == "warning"]
    return errors, warnings
