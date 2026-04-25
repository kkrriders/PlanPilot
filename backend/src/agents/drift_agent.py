import json
from src.agents.base_agent import BaseAgent
from src.agents.shared_memory import SharedMemory
from src.services.llm.groq_provider import GroqProvider, haiku


_SYSTEM = """You are a project drift analyst.
Given computed drift metrics, you diagnose WHY the drift occurred and what to do next.
You distinguish systemic issues (poor estimation, scope creep) from one-off events (blockers, external delays).
Always respond with valid JSON."""

_USER = """Analyze this project drift and identify the root cause.

GOAL: {goal}
CONSTRAINTS:
{constraints}

COMPUTED DRIFT METRICS:
- Schedule drift: {schedule_drift_pct:.1f}%
- Effort drift:   {effort_drift_pct:.1f}%
- Scope drift:    {scope_drift_pct:.1f}%
- Overall drift:  {overall_drift:.1f}%
- Severity:       {severity}

DETAILS:
{details}

RECENT DRIFT EVENTS:
{drift_events}

COMPLETED TASKS (actual vs estimated):
{completed_tasks}

Return JSON:
{{
  "severity": "none|low|medium|high|critical",
  "cause": "underestimation|scope_creep|blocker|resource_issue|external_dependency|unknown",
  "cause_detail": "specific explanation of what caused the drift",
  "recommendation": "replan|monitor|escalate|continue",
  "affected_areas": ["task categories most affected"],
  "confidence": 0.0
}}"""


class DriftAgent(BaseAgent):
    name = "drift"

    def __init__(self, llm: GroqProvider = None):
        super().__init__(llm or haiku)

    @property
    def system_prompt(self) -> str:
        return _SYSTEM

    async def _build_prompt(self, input: dict, memory: SharedMemory) -> str:
        metrics = input.get("metrics", {})
        return _USER.format(
            goal=memory.goal,
            constraints=json.dumps(memory.constraints, indent=2),
            schedule_drift_pct=metrics.get("schedule_drift_pct", 0),
            effort_drift_pct=metrics.get("effort_drift_pct", 0),
            scope_drift_pct=metrics.get("scope_drift_pct", 0),
            overall_drift=metrics.get("overall_drift", 0),
            severity=metrics.get("severity", "unknown"),
            details=json.dumps(metrics.get("details", {}), indent=2),
            drift_events=json.dumps(input.get("drift_events", []), indent=2),
            completed_tasks=json.dumps(input.get("completed_tasks", []), indent=2),
        )

    def _parse_result(self, raw: dict) -> tuple[dict, float, str]:
        confidence = float(raw.get("confidence", 0.6))
        reasoning = f"cause={raw.get('cause', '?')} severity={raw.get('severity', '?')}"
        return raw, confidence, reasoning
