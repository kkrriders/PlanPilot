import json
from typing import AsyncGenerator, AsyncIterator
from groq import AsyncGroq
from src.services.llm.base import LLMProvider
from src.core.config import get_settings

settings = get_settings()

# Groq models:
# llama-3.3-70b-versatile  → complex planning & replanning (like sonnet)
# llama-3.1-8b-instant     → fast drift scoring (like haiku)
GROQ_LARGE = "llama-3.3-70b-versatile"
GROQ_FAST  = "llama-3.1-8b-instant"


class GroqProvider(LLMProvider):
    def __init__(self, model: str = GROQ_LARGE):
        self._client = AsyncGroq(api_key=settings.groq_api_key)
        self.model = model

    async def complete(self, system: str, user: str, max_tokens: int = 4096) -> str:
        response = await self._client.chat.completions.create(
            model=self.model,
            max_tokens=max_tokens,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        return response.choices[0].message.content

    async def complete_json(self, system: str, user: str, max_tokens: int = 4096) -> dict:
        """Complete and parse JSON response. Raises ValueError on parse failure."""
        raw = await self.complete(system, user + "\n\nRespond with valid JSON only, no markdown.", max_tokens)
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1].rsplit("```", 1)[0]
        return json.loads(cleaned)

    async def stream_complete(self, system: str, user: str, max_tokens: int = 4096) -> AsyncGenerator[str, None]:
        stream = await self._client.chat.completions.create(
            model=self.model,
            max_tokens=max_tokens,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta


# Singleton instances — use large model for planning/replanning, fast for drift
sonnet = GroqProvider(model=GROQ_LARGE)   # name kept for import compatibility
haiku  = GroqProvider(model=GROQ_FAST)    # name kept for import compatibility
