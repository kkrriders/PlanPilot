import json
from src.agents.base_agent import BaseAgent
from src.agents.shared_memory import SharedMemory
from src.services.llm.groq_provider import GroqProvider, haiku


_SYSTEM = """You are a senior risk analyst who specializes in software project post-mortems.
You are skeptical and thorough. Your job is to challenge the plan — surface what could go wrong,
what is unrealistic, and what is missing. Do not rubber-stamp plans.
Always respond with valid JSON."""

_USER = """Assess and CHALLENGE this project plan.

GOAL: {goal}
CONSTRAINTS:
{constraints}

PROPOSED TASKS:
{tasks}

CRITICAL PATH: {critical_path_hours} hours across {total_tasks} total tasks

Return JSON:
{{
  "risk_score": 0.0,
  "confidence": 0.0,
  "risk_factors": ["risks that could derail the project"],
  "recommendations": ["concrete improvements"],
  "challenges": ["specific objections to the plan — be direct, not diplomatic"]
}}

risk_score: 0=low risk, 1=extremely risky
confidence: 0=estimates are unreliable, 1=solid estimates
challenges: things the planner got wrong or dangerously underestimated"""


class RiskAgent(BaseAgent):
    name = "risk"

    def __init__(self, llm: GroqProvider = None):
        super().__init__(llm or haiku)

    @property
    def system_prompt(self) -> str:
        return _SYSTEM

    async def _build_prompt(self, input: dict, memory: SharedMemory) -> str:
        tasks = input.get("tasks", [])
        scheduled = input.get("scheduled_tasks", [])
        critical_path_ids = set(input.get("critical_path_ids", []))

        if scheduled and critical_path_ids:
            cp_hours = sum(
                getattr(t, "estimated_hours", 0)
                for t in scheduled
                if getattr(t, "id", None) in critical_path_ids
            )
        else:
            cp_hours = sum(t.get("estimated_hours", 0) for t in tasks)

        return _USER.format(
            goal=memory.goal,
            constraints=json.dumps(memory.constraints, indent=2),
            tasks=json.dumps(tasks, indent=2),
            critical_path_hours=round(cp_hours, 1),
            total_tasks=len(tasks),
        )

    def _parse_result(self, raw: dict) -> tuple[dict, float, str]:
        confidence = float(raw.get("confidence", 0.6))
        reasoning = f"risk_score={raw.get('risk_score', '?')}"
        return raw, confidence, reasoning


def heuristic_risk(constraints: dict, total_tasks: int, critical_path_hours: float) -> float:
    """Fallback risk score when LLM is unavailable. Returns 0.0–0.95."""
    score = 0.3
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
