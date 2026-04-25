import json
from src.agents.base_agent import BaseAgent
from src.agents.shared_memory import SharedMemory
from src.services.llm.groq_provider import GroqProvider, haiku

ACCEPT_THRESHOLD = 7.0

_SYSTEM = """You are a demanding technical project critic.
Your job: score plans ruthlessly and expose structural problems.
You look for missing dependencies, unrealistic timelines, vague descriptions,
work-breakdown gaps, and over-optimistic estimates.
Plans must earn a high score. Be specific. Be harsh. Be fair.
Always respond with valid JSON."""

_USER = """Score and critique this project plan.

GOAL: {goal}
CONSTRAINTS:
{constraints}

TASKS:
{tasks}

RISK ASSESSMENT:
{risk_assessment}

Return JSON:
{{
  "score": 0,
  "verdict": "accept",
  "issues": [
    {{
      "type": "missing_dependency|unrealistic_timeline|vague_task|scope_gap|other",
      "task": "task name or null for plan-level issues",
      "description": "specific problem"
    }}
  ],
  "strengths": ["what the plan does well"],
  "confidence": 0.0
}}

Scoring: 0-4=reject, 5-6=needs revision, 7-8=accept with concerns, 9-10=excellent
verdict MUST be "revise" when score < 7, "accept" when score >= 7"""


class CriticAgent(BaseAgent):
    name = "critic"

    def __init__(self, llm: GroqProvider = None):
        super().__init__(llm or haiku)

    @property
    def system_prompt(self) -> str:
        return _SYSTEM

    async def _build_prompt(self, input: dict, memory: SharedMemory) -> str:
        tasks = input.get("tasks", [])
        risk_out = memory.get("risk") or {}

        return _USER.format(
            goal=memory.goal,
            constraints=json.dumps(memory.constraints, indent=2),
            tasks=json.dumps(tasks, indent=2),
            risk_assessment=json.dumps({
                "risk_score": risk_out.get("risk_score"),
                "risk_factors": risk_out.get("risk_factors", []),
                "challenges": risk_out.get("challenges", []),
            }, indent=2),
        )

    def _parse_result(self, raw: dict) -> tuple[dict, float, str]:
        score = float(raw.get("score", 5.0))
        confidence = float(raw.get("confidence", 0.7))
        verdict = raw.get("verdict", "revise" if score < ACCEPT_THRESHOLD else "accept")
        return {**raw, "verdict": verdict}, confidence, f"score={score}/10 verdict={verdict}"
