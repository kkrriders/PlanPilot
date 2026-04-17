"""Thin async Redis wrapper for short-lived key/value caching."""
import json
import redis.asyncio as aioredis
from src.core.config import get_settings

_client: aioredis.Redis | None = None


def get_redis() -> aioredis.Redis:
    global _client
    if _client is None:
        _client = aioredis.from_url(get_settings().redis_url, decode_responses=True)
    return _client


async def set_json(key: str, value: dict, ttl_seconds: int = 300) -> None:
    await get_redis().setex(key, ttl_seconds, json.dumps(value))


async def get_json(key: str) -> dict | None:
    raw = await get_redis().get(key)
    return json.loads(raw) if raw else None


async def delete(key: str) -> None:
    await get_redis().delete(key)
