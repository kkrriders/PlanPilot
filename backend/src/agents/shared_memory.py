from dataclasses import dataclass, field
from typing import Any


@dataclass
class SharedMemory:
    """
    Carries cross-agent state for one orchestration run.
    Agents read context from here and write their outputs via record().
    """
    plan_id: str
    goal: str
    constraints: dict
    adaptive_context: str = ""
    team_context: str = ""
    completed_tasks: list[dict] = field(default_factory=list)
    agent_outputs: dict[str, Any] = field(default_factory=dict)
    iteration: int = 0

    def record(self, agent_name: str, output: Any) -> None:
        if output is not None:
            self.agent_outputs[agent_name] = output

    def get(self, agent_name: str) -> Any:
        return self.agent_outputs.get(agent_name)
