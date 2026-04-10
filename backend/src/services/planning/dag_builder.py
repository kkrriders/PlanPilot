"""
Builds the task DAG from raw LLM output, resolves name->UUID references,
runs CPM, and returns scheduled tasks with planned start/end times.
"""
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass
import uuid
from src.utils.graph import GraphNode, compute_critical_path, has_cycle


@dataclass
class ScheduledTask:
    id: str
    name: str
    description: str | None
    category: str | None
    priority: int
    estimated_hours: float
    dependencies: list[str]  # predecessor task IDs
    assigned_to: str | None
    planned_start: datetime
    planned_end: datetime
    is_on_critical_path: bool


def build_dag(
    raw_tasks: list[dict],
    project_start: datetime | None = None,
) -> tuple[list[ScheduledTask], list[str]]:
    """
    Args:
        raw_tasks: list of task dicts from LLM (with 'dependencies' as name list)
        project_start: when the project starts (default: now)

    Returns:
        (scheduled_tasks, critical_path_ids)
    """
    if project_start is None:
        project_start = datetime.now(timezone.utc)

    # Assign UUIDs and build name->id map
    name_to_id: dict[str, str] = {}
    id_to_raw: dict[str, dict] = {}
    for task in raw_tasks:
        task_id = str(uuid.uuid4())
        name_to_id[task["name"]] = task_id
        id_to_raw[task_id] = task

    # Build edges (predecessor_id, successor_id)
    edges: list[tuple[str, str]] = []
    for task in raw_tasks:
        task_id = name_to_id[task["name"]]
        for dep_name in task.get("dependencies", []):
            if dep_name in name_to_id:
                pred_id = name_to_id[dep_name]
                edges.append((pred_id, task_id))

    node_ids = list(name_to_id.values())

    # Cycle check before committing
    if has_cycle(node_ids, edges):
        raise ValueError("LLM output contains circular task dependencies")

    # Build GraphNode objects for CPM
    graph_nodes: dict[str, GraphNode] = {
        task_id: GraphNode(
            id=task_id,
            duration=id_to_raw[task_id].get("estimated_hours", 8.0),
            metadata={"name": id_to_raw[task_id]["name"]},
        )
        for task_id in node_ids
    }

    critical_path_ids = compute_critical_path(graph_nodes, edges)

    # Convert CPM times (hours offset from start) to datetime
    hours_per_workday = 8.0

    def hours_to_dt(hours: float) -> datetime:
        # Simple: add calendar hours (no weekend skipping for MVP)
        return project_start + timedelta(hours=hours)

    scheduled: list[ScheduledTask] = []
    for task_id, node in graph_nodes.items():
        raw = id_to_raw[task_id]
        dep_names = raw.get("dependencies", [])
        dep_ids = [name_to_id[n] for n in dep_names if n in name_to_id]
        scheduled.append(
            ScheduledTask(
                id=task_id,
                name=raw["name"],
                description=raw.get("description"),
                category=raw.get("category"),
                priority=raw.get("priority", 3),
                estimated_hours=raw.get("estimated_hours", 8.0),
                dependencies=dep_ids,
                assigned_to=raw.get("assigned_to"),
                planned_start=hours_to_dt(node.early_start),
                planned_end=hours_to_dt(node.early_finish),
                is_on_critical_path=node.on_critical_path,
            )
        )

    return scheduled, critical_path_ids
