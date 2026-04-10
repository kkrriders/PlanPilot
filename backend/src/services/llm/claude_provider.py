import anthropic
import json
from typing import AsyncIterator
from src.services.llm.base import LLMProvider
from src.core.config import get_settings

settings = get_settings()


class ClaudeProvider(LLMProvider):
    def __init__(self, model: str = "claude-sonnet-4-6"):
        self._client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        self.model = model

    async def complete(self, system: str, user: str, max_tokens: int = 4096) -> str:
        message = await self._client.messages.create(
            model=self.model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        return message.content[0].text

    async def complete_json(self, system: str, user: str, max_tokens: int = 4096) -> dict:
        """Complete and parse JSON response. Raises ValueError on parse failure."""
        raw = await self.complete(system, user + "\n\nRespond with valid JSON only, no markdown.", max_tokens)
        # Strip markdown code fences if present
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1].rsplit("```", 1)[0]
        return json.loads(cleaned)

    async def stream_complete(self, system: str, user: str, max_tokens: int = 4096) -> AsyncIterator[str]:
        async with self._client.messages.stream(
            model=self.model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        ) as stream:
            async for text in stream.text_stream:
                yield text


# Singleton instances — use sonnet for planning, haiku for drift
sonnet = ClaudeProvider(model="claude-sonnet-4-6")
haiku = ClaudeProvider(model="claude-haiku-4-5-20251001")
