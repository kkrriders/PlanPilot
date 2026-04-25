import json
from src.agents.base_agent import BaseAgent
from src.agents.shared_memory import SharedMemory
from src.services.llm.groq_provider import GroqProvider, sonnet


_SYSTEM = """You are an expert project replanner.
You replan ONLY remaining tasks — completed work is frozen and must not appear in output.
You factor in drift analysis and risk feedback to produce conservative, realistic revised estimates.
If effort has been running 30% over, your new estimates should reflect that.
Always respond with valid JSON."""

_USER = """Replan the remaining work for this project.

ORIGINAL GOAL: {goal}
CONSTRAINTS:
{constraints}

DRIFT ANALYSIS:
{drift_analysis}

COMPLETED TASKS (FROZEN — do not include):
{completed_tasks}

REMAINING TASKS (current state):
{remaining_tasks}

RISK FEEDBACK:
{risk_feedback}

You may split, merge, add, or remove remaining tasks.
Adjust estimates based on observed drift patterns.

Return JSON:
{{
  "tasks": [
    {{
      "name": "Task name",
      "description": "Description",
      "category": "design|dev|test|deploy|review|research|planning",
      "estimated_hours": 8.0,
      "priority": 2,
      "dependencies": ["predecessor task names"],
      "assigned_to": null
    }}
  ],
  "reasoning": "Key changes made and why",
  "confidence": 0.0
}}"""


class ReplannerAgent(BaseAgent):
    name = "replanner"

    def __init__(self, llm: GroqProvider = None):
        super().__init__(llm or sonnet)

    @property
    def system_prompt(self) -> str:
        return _SYSTEM

    async def _build_prompt(self, input: dict, memory: SharedMemory) -> str:
        drift_out = memory.get("drift") or input.get("drift_output", {})
        risk_out = memory.get("risk") or {}

        return _USER.format(
            goal=memory.goal,
            constraints=json.dumps(memory.constraints, indent=2),
            drift_analysis=json.dumps(drift_out, indent=2),
            completed_tasks=json.dumps(input.get("completed_tasks", []), indent=2),
            remaining_tasks=json.dumps(input.get("remaining_tasks", []), indent=2),
            risk_feedback=json.dumps(risk_out.get("challenges", []), indent=2),
        )

    def _parse_result(self, raw: dict) -> tuple[dict, float, str]:
        return (
            {"tasks": raw.get("tasks", [])},
            float(raw.get("confidence", 0.6)),
            raw.get("reasoning", ""),
        )
