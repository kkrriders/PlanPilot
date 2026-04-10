"""
DAG utilities: Kahn's topological sort + CPM (Critical Path Method).
No external graph library needed.
"""
from dataclasses import dataclass, field
from typing import Any
import math


@dataclass
class GraphNode:
    id: str
    duration: float  # hours
    # CPM fields
    early_start: float = 0.0
    early_finish: float = 0.0
    late_start: float = math.inf
    late_finish: float = math.inf
    slack: float = math.inf
    on_critical_path: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)


def topological_sort(nodes: list[str], edges: list[tuple[str, str]]) -> list[str]:
    """
    Kahn's algorithm. Returns topologically sorted node IDs.
    Raises ValueError on cycle detection.
    """
    in_degree: dict[str, int] = {n: 0 for n in nodes}
    adjacency: dict[str, list[str]] = {n: [] for n in nodes}

    for pred, succ in edges:
        adjacency[pred].append(succ)
        in_degree[succ] += 1

    queue = [n for n in nodes if in_degree[n] == 0]
    result: list[str] = []

    while queue:
        node = queue.pop(0)
        result.append(node)
        for neighbor in adjacency[node]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    if len(result) != len(nodes):
        raise ValueError("Cycle detected in dependency graph")

    return result


def compute_critical_path(
    graph_nodes: dict[str, GraphNode],
    edges: list[tuple[str, str]],  # (predecessor_id, successor_id)
) -> list[str]:
    """
    Runs CPM forward and backward passes.
    Mutates graph_nodes in place with CPM values.
    Returns list of node IDs on the critical path.
    """
    node_ids = list(graph_nodes.keys())
    adjacency: dict[str, list[str]] = {n: [] for n in node_ids}
    predecessors: dict[str, list[str]] = {n: [] for n in node_ids}

    for pred, succ in edges:
        adjacency[pred].append(succ)
        predecessors[succ].append(pred)

    topo_order = topological_sort(node_ids, edges)

    # Forward pass: compute ES and EF
    for node_id in topo_order:
        node = graph_nodes[node_id]
        if not predecessors[node_id]:
            node.early_start = 0.0
        else:
            node.early_start = max(
                graph_nodes[p].early_finish for p in predecessors[node_id]
            )
        node.early_finish = node.early_start + node.duration

    # Project duration = max EF across all nodes with no successors
    project_duration = max(
        graph_nodes[n].early_finish
        for n in node_ids
        if not adjacency[n]
    )

    # Backward pass: compute LS and LF
    for node_id in reversed(topo_order):
        node = graph_nodes[node_id]
        if not adjacency[node_id]:
            node.late_finish = project_duration
        else:
            node.late_finish = min(
                graph_nodes[s].late_start for s in adjacency[node_id]
            )
        node.late_start = node.late_finish - node.duration
        node.slack = node.late_finish - node.early_finish
        node.on_critical_path = abs(node.slack) < 0.001

    return [n for n in node_ids if graph_nodes[n].on_critical_path]


def has_cycle(nodes: list[str], edges: list[tuple[str, str]]) -> bool:
    try:
        topological_sort(nodes, edges)
        return False
    except ValueError:
        return True
