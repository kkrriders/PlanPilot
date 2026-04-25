import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from src.services.llm.groq_provider import GroqProvider
from src.agents.shared_memory import SharedMemory

logger = logging.getLogger(__name__)


@dataclass
class AgentResult:
    agent_name: str
    output: dict
    confidence: float
    reasoning: str = ""
    metadata: dict = field(default_factory=dict)


class BaseAgent(ABC):
    name: str = "base"
    max_retries: int = 2

    def __init__(self, llm: GroqProvider):
        self.llm = llm

    @property
    @abstractmethod
    def system_prompt(self) -> str: ...

    @abstractmethod
    async def _build_prompt(self, input: dict, memory: SharedMemory) -> str: ...

    @abstractmethod
    def _parse_result(self, raw: dict) -> tuple[dict, float, str]:
        """Returns (output, confidence, reasoning)."""
        ...

    async def act(self, input: dict, memory: SharedMemory) -> AgentResult:
        prompt = await self._build_prompt(input, memory)
        last_exc: Exception | None = None

        for attempt in range(self.max_retries + 1):
            try:
                raw = await self.llm.complete_json(self.system_prompt, prompt)
                output, confidence, reasoning = self._parse_result(raw)
                memory.record(self.name, output)
                return AgentResult(
                    agent_name=self.name,
                    output=output,
                    confidence=confidence,
                    reasoning=reasoning,
                )
            except Exception as exc:
                last_exc = exc
                logger.warning(
                    "%s attempt %d/%d failed: %s",
                    self.name, attempt + 1, self.max_retries + 1, exc,
                )

        logger.error("%s exhausted retries", self.name)
        return self._fallback(last_exc)

    def _fallback(self, exc: Exception | None) -> AgentResult:
        return AgentResult(
            agent_name=self.name,
            output={},
            confidence=0.0,
            reasoning=f"Agent failed after {self.max_retries + 1} attempts",
            metadata={"error": str(exc)},
        )
