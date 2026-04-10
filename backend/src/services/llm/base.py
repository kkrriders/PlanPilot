from abc import ABC, abstractmethod
from typing import AsyncIterator


class LLMProvider(ABC):
    @abstractmethod
    async def complete(self, system: str, user: str, max_tokens: int = 4096) -> str:
        pass

    async def complete_json(self, system: str, user: str, max_tokens: int = 4096) -> dict:
        raise NotImplementedError

    @abstractmethod
    async def stream_complete(self, system: str, user: str, max_tokens: int = 4096) -> AsyncIterator[str]:  # type: ignore[override]
        pass
