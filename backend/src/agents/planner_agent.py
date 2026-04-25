import json
from src.agents.base_agent import BaseAgent
from src.agents.shared_memory import SharedMemory
from src.services.llm.groq_provider import GroqProvider, sonnet


_SYSTEM = """You are a senior project manager and software architect with 15 years of experience.
Your specialty is breaking down ambitious goals into realistic, well-structured task plans.
You are pragmatic, skeptical of overly optimistic estimates, and always think about dependencies first.
Always respond with valid JSON matching the exact schema requested."""

_USER = """Break down the following project goal into a detailed task list.

GOAL: {goal}

CONSTRAINTS:
- Deadline: {deadline_days} days
- Team size: {team_size} people
- Budget: ${budget_usd}
- Tech stack: {tech_stack}
- Notes: {notes}

HARD LIMITS (you MUST NOT violate these — they are computed from the constraints above):
- Total available hours: {total_available_hours}h  ({deadline_days}d × 8h/day × {team_size} people)
- Your tasks MUST sum to ≤ {total_available_hours}h
- Max parallel tasks at any time: {team_size}
- Each task: 2h minimum, 16h maximum
- Max tasks to generate: {max_tasks}  (based on team size and deadline)
- Do NOT generate tasks that together exceed the deadline — the plan must be executable

TEAM MEMBERS & SKILLS:
{team_context}

ADAPTIVE CONTEXT (learned from past projects):
{adaptive_context}

{feedback_section}
Return JSON:
{{
  "tasks": [
    {{
      "name": "Task name (short, action-oriented)",
      "description": "What needs to be done and why",
      "category": "design|dev|test|deploy|review|research|planning",
      "estimated_hours": 8.0,
      "priority": 2,
      "dependencies": ["name of predecessor task"],
      "assigned_to": "Exact team member name or null"
    }}
  ],
  "reasoning": "Brief explanation of key planning decisions",
  "confidence": 0.0
}}

Rules:
- Priority: 1=critical, 2=high, 3=medium, 4=low, 5=optional
- Dependencies reference other task names exactly — no circular deps
- Assign to team member whose skills best match; use EXACT names"""

_REVISION_SECTION = """REVISION REQUEST (you must address these before finalizing):

RISK AGENT CHALLENGES:
{risk_challenges}

CRITIC AGENT ISSUES:
{critic_issues}

For each issue: either REVISE the affected task(s) or DEFEND your choice in reasoning.
Do not silently ignore any listed issue.
"""


def _compute_hard_limits(constraints: dict) -> dict:
    deadline_days = constraints.get("deadline_days")
    team_size = constraints.get("team_size")

    try:
        days = float(deadline_days)
    except (TypeError, ValueError):
        days = None

    try:
        people = max(1, int(team_size))
    except (TypeError, ValueError):
        people = 1

    if days is not None and days > 0:
        total_hours = int(days * 8 * people)
        max_tasks = min(20, max(8, int(days * people * 0.6)))
    else:
        total_hours = "not specified"
        max_tasks = 20

    return {
        "total_available_hours": total_hours,
        "max_tasks": max_tasks,
        "deadline_days": deadline_days or "not specified",
        "team_size": people,
    }


class PlannerAgent(BaseAgent):
    name = "planner"

    def __init__(self, llm: GroqProvider = None):
        super().__init__(llm or sonnet)

    @property
    def system_prompt(self) -> str:
        return _SYSTEM

    async def _build_prompt(self, input: dict, memory: SharedMemory) -> str:
        c = memory.constraints
        risk_out = memory.get("risk")
        critic_out = memory.get("critic")

        if memory.iteration > 0 and (risk_out or critic_out):
            feedback_section = _REVISION_SECTION.format(
                risk_challenges=json.dumps((risk_out or {}).get("challenges", []), indent=2),
                critic_issues=json.dumps((critic_out or {}).get("issues", []), indent=2),
            )
        else:
            feedback_section = ""

        limits = _compute_hard_limits(c)

        return _USER.format(
            goal=memory.goal,
            deadline_days=limits["deadline_days"],
            team_size=limits["team_size"],
            budget_usd=c.get("budget_usd", "not specified"),
            tech_stack=", ".join(c.get("tech_stack", [])) or "not specified",
            notes=c.get("notes", "none"),
            total_available_hours=limits["total_available_hours"],
            max_tasks=limits["max_tasks"],
            team_context=memory.team_context or "No team members defined.",
            adaptive_context=memory.adaptive_context or "No historical data.",
            feedback_section=feedback_section,
        )

    def _parse_result(self, raw: dict) -> tuple[dict, float, str]:
        return (
            {"tasks": raw.get("tasks", [])},
            float(raw.get("confidence", 0.7)),
            raw.get("reasoning", ""),
        )
