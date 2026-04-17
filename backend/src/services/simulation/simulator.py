"""
Demo simulator: bot engineers make realistic progress over compressed "days".
Bypasses compliance checks — for demo use only.
"""
import random
import uuid
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from src.models.task import Task, TaskDependency
from src.models.execution import ExecutionLog
from src.models.plan import Plan
from src.models.team import TeamMember
from src.services.drift.detector import compute_drift


# Scenario definitions
SCENARIOS = {
    "optimistic":    {"speed_mult": 0.80, "block_chance": 0.02, "dropout_day": None},
    "realistic":     {"speed_mult": 1.00, "block_chance": 0.10, "dropout_day": None},
    "pessimistic":   {"speed_mult": 1.45, "block_chance": 0.25, "dropout_day": None},
    "key_person_leaves": {"speed_mult": 1.10, "block_chance": 0.12, "dropout_day": 5},
}

# Bot personalities — speed_factor > 1.0 means they run over estimate
DEFAULT_BOTS = [
    {"name": "Alex Chen",    "speed": 0.85, "role": "Frontend",   "emoji": "🟦"},
    {"name": "Jordan Lee",   "speed": 1.45, "role": "Backend",    "emoji": "🟧"},  # drift-maker
    {"name": "Sam Rivera",   "speed": 1.00, "role": "Full-stack", "emoji": "🟩"},
    {"name": "Maya Patel",   "speed": 1.30, "role": "DevOps",     "emoji": "🟥"},
]

NOTES_STARTED = {
    "dev":      ["Starting implementation, reviewing spec first.",
                 "Picked up this ticket. Setting up local branch.",
                 "Beginning development. Scoping the approach."],
    "test":     ["Writing test plan. Identifying edge cases.",
                 "Starting test implementation.",
                 "Kicked off test suite for this feature."],
    "design":   ["Starting design exploration in Figma.",
                 "Beginning wireframes and component mapping.",
                 "Reviewing design system before starting."],
    "deploy":   ["Reviewing deployment config and checklist.",
                 "Starting deployment pipeline setup.",
                 "Checking environment variables and secrets."],
    "review":   ["Beginning code review pass.",
                 "Starting review. Checking logic and edge cases.",
                 "Pulling the branch and reviewing locally."],
    "research": ["Starting research phase. Reviewing prior art.",
                 "Gathering requirements and existing solutions.",
                 "Starting spike investigation."],
    "planning": ["Kicking off planning session.",
                 "Drafting breakdown for this work item.",
                 "Starting requirements gathering."],
}

NOTES_COMPLETED = {
    "dev":      ["Implementation complete. Unit tests written and passing. PR raised.",
                 "Feature done and merged. Added error handling and logging.",
                 "Completed per spec. Reviewed by teammate, merged to main."],
    "test":     ["All test cases passing. Coverage at 87%. Report attached.",
                 "QA complete. Found 2 minor issues — both fixed before close.",
                 "Test suite green. Regression passed with no new failures."],
    "design":   ["Designs finalised and shared in Figma. Handoff notes added.",
                 "Wireframes approved. Components documented in design system.",
                 "Design complete. Reviewed with PM, minor revisions applied."],
    "deploy":   ["Deployed to staging. Smoke tests passed. Ready for prod sign-off.",
                 "Pipeline deployed successfully. Monitoring looks clean.",
                 "Deployment complete. Rollback plan documented."],
    "review":   ["Review done. Left comments on 3 areas needing rework.",
                 "Code review complete. Approved with minor suggestions.",
                 "Review finished. Logic is sound. Approved."],
    "research": ["Research complete. Findings documented in Confluence.",
                 "Spike finished. Recommendation: proceed with option B.",
                 "Investigation done. Summarised in ticket with pros/cons."],
    "planning": ["Planning complete. Tasks broken down and estimated.",
                 "Requirements finalised. Stakeholder sign-off received.",
                 "Planning done. Risks documented and mitigated."],
}

NOTES_BLOCKED = [
    "Blocked waiting for API credentials from the third-party vendor.",
    "Blocked on design sign-off — awaiting PM feedback.",
    "Blocked: upstream task not yet complete, dependency not met.",
    "Blocked pending infrastructure access from DevOps.",
    "Blocked on a decision from the architecture review board.",
]

EVIDENCE_URLS = [
    "https://github.com/org/repo/pull/{n}",
    "https://github.com/org/repo/commit/{h}",
    "https://staging.app.com/deploy/{n}",
    "https://figma.com/file/{h}/design-review",
    "https://docs.company.com/adr/{n}",
]


def _pick_note(notes_map: dict, category: str | None) -> str:
    key = category if category in notes_map else "dev"
    return random.choice(notes_map[key])


def _pick_evidence() -> str:
    template = random.choice(EVIDENCE_URLS)
    return template.format(n=random.randint(10, 999), h=uuid.uuid4().hex[:7])


def _compute_actual_hours(estimated: float, speed: float) -> float:
    noise = random.uniform(0.85, 1.20)
    return round(max(0.5, estimated * speed * noise), 1)


def _bot_for_task(task: Task, bots: list[dict]) -> dict:
    if task.assigned_to:
        for b in bots:
            if b["name"].lower() == task.assigned_to.lower():
                return b
    return random.choice(bots)


def _apply_scenario(bots: list[dict], scenario: str, current_day: int) -> tuple[list[dict], float, float]:
    """Return (active_bots, speed_multiplier, block_chance) for the current day."""
    cfg = SCENARIOS.get(scenario, SCENARIOS["realistic"])
    active_bots = list(bots)

    # Key person leaves: drop the slowest bot after dropout_day
    if cfg["dropout_day"] and current_day >= cfg["dropout_day"] and len(active_bots) > 1:
        active_bots = sorted(active_bots, key=lambda b: b["speed"])[:-1]

    return active_bots, cfg["speed_mult"], cfg["block_chance"]


async def simulate_step(plan_id: str, db: AsyncSession, scenario: str = "realistic", current_day: int = 1) -> dict:
    """
    Advance simulation by one compressed 'day'.
    Returns events list + current state.
    """
    plan_uuid = uuid.UUID(plan_id)

    plan_res = await db.execute(select(Plan).where(Plan.id == plan_uuid))
    plan = plan_res.scalar_one_or_none()
    if not plan:
        raise ValueError("Plan not found")

    task_res = await db.execute(
        select(Task).where(Task.plan_id == plan_uuid, Task.version == plan.current_version)
    )
    tasks: list[Task] = list(task_res.scalars().all())

    dep_res = await db.execute(select(TaskDependency).where(TaskDependency.plan_id == plan_uuid))
    deps = dep_res.scalars().all()

    pred_map: dict[uuid.UUID, set[uuid.UUID]] = {}
    for d in deps:
        pred_map.setdefault(d.successor_id, set()).add(d.predecessor_id)

    completed_ids = {t.id for t in tasks if t.status == "completed"}
    in_progress = [t for t in tasks if t.status == "in_progress"]
    pending = [t for t in tasks if t.status == "pending"]

    # Load team members as bots
    member_res = await db.execute(select(TeamMember).where(TeamMember.plan_id == plan_uuid))
    members = member_res.scalars().all()
    base_bots = (
        [{"name": m.name, "speed": _speed_for_member(i), "role": m.role, "emoji": _emoji_for(i)}
         for i, m in enumerate(members)]
        if members else DEFAULT_BOTS
    )

    active_bots, speed_mult, block_chance = _apply_scenario(base_bots, scenario, current_day)

    # Critical path task IDs for this version
    critical_ids = {t.id for t in tasks if t.is_on_critical_path}

    now = datetime.now(timezone.utc)
    events = []

    # --- Phase 1: Complete / block in-progress tasks ---
    for task in in_progress:
        bot = _bot_for_task(task, active_bots)

        if random.random() < block_chance:
            task.status = "blocked"
            note = random.choice(NOTES_BLOCKED)
            db.add(ExecutionLog(
                task_id=task.id, plan_id=plan_uuid,
                event_type="blocked", prev_status="in_progress", new_status="blocked",
                pct_complete=random.randint(30, 70),
                note=note, logged_by=plan.user_id,
            ))
            events.append({
                "type": "blocked",
                "task": task.name,
                "task_id": str(task.id),
                "bot": bot["name"],
                "emoji": bot["emoji"],
                "note": note,
                "is_on_critical_path": task.id in critical_ids,
            })
            continue

        estimated = task.estimated_hours or 8.0
        actual = _compute_actual_hours(estimated, bot["speed"] * speed_mult)
        task.status = "completed"
        task.actual_hours = actual
        task.actual_end = now
        if not task.actual_start:
            task.actual_start = now - timedelta(hours=actual)

        note = _pick_note(NOTES_COMPLETED, task.category)
        evidence = _pick_evidence()
        db.add(ExecutionLog(
            task_id=task.id, plan_id=plan_uuid,
            event_type="completed", prev_status="in_progress", new_status="completed",
            pct_complete=100, note=note, evidence_url=evidence,
            logged_by=plan.user_id,
        ))
        completed_ids.add(task.id)

        events.append({
            "type": "completed",
            "task": task.name,
            "task_id": str(task.id),
            "bot": bot["name"],
            "emoji": bot["emoji"],
            "estimated_hours": estimated,
            "actual_hours": actual,
            "over_under": round(actual - estimated, 1),
            "note": note,
            "is_on_critical_path": task.id in critical_ids,
        })

    # --- Phase 2: Start 1-3 ready pending tasks ---
    ready = [
        t for t in pending
        if all(p in completed_ids for p in pred_map.get(t.id, set()))
    ]
    random.shuffle(ready)
    to_start = ready[:random.randint(1, min(3, max(1, len(ready))))]

    for task in to_start:
        bot = _bot_for_task(task, active_bots)
        task.status = "in_progress"
        task.actual_start = now

        note = _pick_note(NOTES_STARTED, task.category)
        db.add(ExecutionLog(
            task_id=task.id, plan_id=plan_uuid,
            event_type="started", prev_status="pending", new_status="in_progress",
            pct_complete=0, note=note, logged_by=plan.user_id,
        ))
        events.append({
            "type": "started",
            "task": task.name,
            "task_id": str(task.id),
            "bot": bot["name"],
            "emoji": bot["emoji"],
            "note": note,
            "is_on_critical_path": task.id in critical_ids,
        })

    await db.flush()

    # --- Recompute drift ---
    try:
        drift = await compute_drift(plan_id, db)
        await db.flush()
        drift_info = {
            "severity": drift.severity,
            "schedule_drift_pct": drift.schedule_drift_pct,
            "effort_drift_pct": drift.effort_drift_pct,
            "overall_drift": drift.overall_drift,
        }
    except Exception:
        drift_info = {"severity": "none", "schedule_drift_pct": 0, "effort_drift_pct": 0, "overall_drift": 0}

    await db.commit()

    # Fresh stats
    all_tasks = list((await db.execute(
        select(Task).where(Task.plan_id == plan_uuid, Task.version == plan.current_version)
    )).scalars().all())

    total = len(all_tasks)
    done = sum(1 for t in all_tasks if t.status == "completed")
    in_prog = sum(1 for t in all_tasks if t.status == "in_progress")
    blocked_count = sum(1 for t in all_tasks if t.status == "blocked")
    all_done = done >= total

    # Projected completion: avg tasks/day × remaining
    remaining = total - done
    tasks_this_day = sum(1 for e in events if e["type"] == "completed")
    avg_per_day = max(tasks_this_day, 1)
    projected_days_remaining = round(remaining / avg_per_day) if remaining > 0 else 0

    # Scenario info for frontend display
    scenario_cfg = SCENARIOS.get(scenario, SCENARIOS["realistic"])
    dropped_bot = None
    if scenario_cfg["dropout_day"] and current_day >= scenario_cfg["dropout_day"] and len(base_bots) > 1:
        dropped_bot = sorted(base_bots, key=lambda b: b["speed"])[-1]["name"]

    return {
        "events": events,
        "total_tasks": total,
        "completed_tasks": done,
        "in_progress_tasks": in_prog,
        "blocked_tasks": blocked_count,
        "progress_pct": round(done / total * 100) if total else 0,
        "drift": drift_info,
        "simulation_complete": all_done,
        "projected_days_remaining": projected_days_remaining,
        "scenario": scenario,
        "dropped_bot": dropped_bot,
    }


async def reset_simulation(plan_id: str, db: AsyncSession) -> dict:
    plan_uuid = uuid.UUID(plan_id)
    await db.execute(delete(ExecutionLog).where(ExecutionLog.plan_id == plan_uuid))
    task_res = await db.execute(
        select(Task).where(Task.plan_id == plan_uuid)
    )
    for task in task_res.scalars().all():
        task.status = "pending"
        task.actual_start = None
        task.actual_end = None
        task.actual_hours = None
    await db.commit()
    return {"reset": True}


def _speed_for_member(index: int) -> float:
    speeds = [0.90, 1.40, 1.05, 1.25, 0.95, 1.15, 1.00, 1.35]
    return speeds[index % len(speeds)]


def _emoji_for(index: int) -> str:
    emojis = ["🟦", "🟧", "🟩", "🟥", "🟪", "🟨", "⬜", "🟫"]
    return emojis[index % len(emojis)]
