"""
Central orchestrator for plan generation.

Flow per iteration:
  PlannerAgent → [RiskAgent + CriticAgent in parallel] → accept OR revise

Revision is triggered when risk_score > RISK_THRESHOLD or critic verdict == "revise".
After max_iterations the current plan is accepted regardless.

Modes:
  fast     — 1 iteration, no revision loop (fastest, cheapest)
  accurate — 3 iterations, standard thresholds (default)
  debate   — 3 iterations, tighter thresholds (hardest to accept)
"""
import asyncio
import logging
from dataclasses import dataclass, field
from typing import Literal

from src.agents.shared_memory import SharedMemory
from src.agents.base_agent import AgentResult
from src.agents.planner_agent import PlannerAgent
from src.agents.risk_agent import RiskAgent
from src.agents.critic_agent import CriticAgent

logger = logging.getLogger(__name__)

PlanningMode = Literal["fast", "accurate", "debate"]

_MODE_CONFIG: dict[str, dict] = {
    "fast":     {"max_iterations": 1, "risk_threshold": 0.70},
    "accurate": {"max_iterations": 3, "risk_threshold": 0.70},
    "debate":   {"max_iterations": 3, "risk_threshold": 0.50},
}


@dataclass
class OrchestratorResult:
    tasks: list[dict]
    risk_score: float
    confidence: float
    risk_factors: list[str]
    recommendations: list[str]
    critic_score: float
    iterations_used: int
    planner_reasoning: str
    mode: str = "accurate"
    debate_log: list[dict] = field(default_factory=list)


class MultiAgentOrchestrator:
    def __init__(self, mode: PlanningMode = "accurate"):
        cfg = _MODE_CONFIG[mode]
        self.mode = mode
        self.max_iterations = cfg["max_iterations"]
        self.risk_threshold = cfg["risk_threshold"]
        self.planner = PlannerAgent()
        self.risk = RiskAgent()
        self.critic = CriticAgent()

    async def run_planning(
        self,
        plan_id: str,
        goal: str,
        constraints: dict,
        adaptive_context: str = "",
        team_context: str = "",
        completed_tasks: list[dict] | None = None,
    ) -> OrchestratorResult:
        memory = SharedMemory(
            plan_id=plan_id,
            goal=goal,
            constraints=constraints,
            adaptive_context=adaptive_context,
            team_context=team_context,
            completed_tasks=completed_tasks or [],
        )

        last_good_plan: AgentResult | None = None
        risk_result: AgentResult | None = None
        critic_result: AgentResult | None = None
        debate_log: list[dict] = []

        for iteration in range(self.max_iterations):
            memory.iteration = iteration
            logger.info(
                "Orchestrator iteration %d/%d — plan_id=%s",
                iteration + 1, self.max_iterations, plan_id,
            )

            plan_result = await self.planner.act({}, memory)
            tasks = plan_result.output.get("tasks", [])

            if not tasks:
                logger.warning("PlannerAgent returned no tasks on iteration %d", iteration + 1)
                break

            last_good_plan = plan_result

            risk_result, critic_result = await asyncio.gather(
                self.risk.act({"tasks": tasks}, memory),
                self.critic.act({"tasks": tasks}, memory),
            )

            risk_score = float(risk_result.output.get("risk_score", 1.0))
            critic_score = float(critic_result.output.get("score", 0.0))
            verdict = critic_result.output.get("verdict", "revise")

            debate_log.append({
                "iteration": iteration + 1,
                "verdict": verdict,
                "risk_score": round(risk_score, 3),
                "critic_score": round(critic_score, 1),
                "planner_reasoning": plan_result.reasoning,
                "risk_factors": risk_result.output.get("risk_factors", []),
                "risk_challenges": risk_result.output.get("challenges", []),
                "critic_issues": critic_result.output.get("issues", []),
                "critic_strengths": critic_result.output.get("strengths", []),
            })

            logger.info(
                "Iteration %d result: risk=%.2f critic=%.1f/10 verdict=%s",
                iteration + 1, risk_score, critic_score, verdict,
            )

            if risk_score <= self.risk_threshold and verdict == "accept":
                logger.info("Plan accepted at iteration %d", iteration + 1)
                break

            if iteration == self.max_iterations - 1:
                logger.info("Max iterations reached — accepting plan as-is")

        risk_out = risk_result.output if risk_result else {}
        critic_out = critic_result.output if critic_result else {}

        return OrchestratorResult(
            tasks=last_good_plan.output.get("tasks", []) if last_good_plan else [],
            risk_score=float(risk_out.get("risk_score", 0.5)),
            confidence=float(risk_out.get("confidence", 0.6)),
            risk_factors=risk_out.get("risk_factors", []),
            recommendations=risk_out.get("recommendations", []),
            critic_score=float(critic_out.get("score", 0.0)),
            iterations_used=memory.iteration + 1,
            planner_reasoning=last_good_plan.reasoning if last_good_plan else "",
            mode=self.mode,
            debate_log=debate_log,
        )
