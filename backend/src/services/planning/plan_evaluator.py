"""
Combines LLM risk score with structural metrics for final risk/confidence.
"""
import json
from src.services.llm.groq_provider import sonnet
from src.services.llm.prompt_templates import RISK_SYSTEM, RISK_USER


async def evaluate_plan(
    goal: str,
    constraints: dict,
    scheduled_tasks: list,
    critical_path_ids: list[str],
) -> tuple[float, float, list[str], list[str]]:
    """
    Returns (risk_score, confidence, risk_factors, recommendations)
    """
    total_tasks = len(scheduled_tasks)
    critical_path_hours = sum(
        t.estimated_hours for t in scheduled_tasks if t.id in critical_path_ids
    )

    prompt = RISK_USER.format(
        goal=goal,
        constraints=json.dumps(constraints, indent=2),
        critical_path_hours=round(critical_path_hours, 1),
        total_tasks=total_tasks,
        critical_path_count=len(critical_path_ids),
    )

    try:
        result = await sonnet.complete_json(RISK_SYSTEM, prompt, max_tokens=1024)
        risk_score = float(result.get("risk_score", 0.5))
        confidence = float(result.get("confidence", 0.5))
        risk_factors = result.get("risk_factors", [])
        recommendations = result.get("recommendations", [])
    except Exception:
        # Fallback to heuristic scoring
        risk_score = _heuristic_risk(constraints, total_tasks, critical_path_hours)
        confidence = 0.6
        risk_factors = ["LLM evaluation unavailable — using heuristic scoring"]
        recommendations = []

    return (
        max(0.0, min(1.0, risk_score)),
        max(0.0, min(1.0, confidence)),
        risk_factors,
        recommendations,
    )


def _heuristic_risk(constraints: dict, total_tasks: int, critical_path_hours: float) -> float:
    score = 0.3  # baseline
    deadline_days = constraints.get("deadline_days")
    if deadline_days:
        ratio = critical_path_hours / (deadline_days * 8)
        if ratio > 0.9:
            score += 0.3
        elif ratio > 0.7:
            score += 0.15
    if total_tasks > 20:
        score += 0.1
    if not constraints.get("team_size"):
        score += 0.05
    return min(score, 0.95)
