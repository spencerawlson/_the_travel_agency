"""Small key/value + counter abstraction over Redis, with an in-memory fallback
for tests and single-process development without Redis."""

from __future__ import annotations

import json
import time
from typing import Any, Protocol

from redis.asyncio import Redis


class Cache(Protocol):
    async def get_json(self, key: str) -> Any | None: ...
    async def set_json(self, key: str, value: Any, ttl_seconds: int) -> None: ...
    async def incr_window(self, key: str, window_seconds: int) -> int: ...
    async def ping(self) -> bool: ...
    async def close(self) -> None: ...


class RedisCache:
    def __init__(self, url: str) -> None:
        self._redis: Redis = Redis.from_url(url, decode_responses=True, socket_timeout=2)

    async def get_json(self, key: str) -> Any | None:
        raw = await self._redis.get(key)
        return json.loads(raw) if raw else None

    async def set_json(self, key: str, value: Any, ttl_seconds: int) -> None:
        await self._redis.set(key, json.dumps(value, default=str), ex=ttl_seconds)

    async def incr_window(self, key: str, window_seconds: int) -> int:
        pipe = self._redis.pipeline()
        pipe.incr(key)
        pipe.expire(key, window_seconds, nx=True)
        count, _ = await pipe.execute()
        return int(count)

    async def ping(self) -> bool:
        try:
            return bool(await self._redis.ping())
        except Exception:
            return False

    async def close(self) -> None:
        await self._redis.aclose()


class MemoryCache:
    def __init__(self) -> None:
        self._data: dict[str, tuple[float, Any]] = {}

    def _alive(self, key: str) -> Any | None:
        item = self._data.get(key)
        if item is None:
            return None
        expires, value = item
        if expires < time.monotonic():
            self._data.pop(key, None)
            return None
        return value

    async def get_json(self, key: str) -> Any | None:
        value = self._alive(key)
        return json.loads(value) if value is not None else None

    async def set_json(self, key: str, value: Any, ttl_seconds: int) -> None:
        self._data[key] = (time.monotonic() + ttl_seconds, json.dumps(value, default=str))

    async def incr_window(self, key: str, window_seconds: int) -> int:
        current = self._alive(key)
        if current is None:
            self._data[key] = (time.monotonic() + window_seconds, 1)
            return 1
        expires, _ = self._data[key]
        self._data[key] = (expires, current + 1)
        return int(current + 1)

    async def ping(self) -> bool:
        return True

    async def close(self) -> None:
        self._data.clear()


_cache: Cache | None = None


def init_cache(url: str | None) -> Cache:
    global _cache
    _cache = RedisCache(url) if url else MemoryCache()
    return _cache


def get_cache() -> Cache:
    if _cache is None:
        raise RuntimeError("Cache not initialised")
    return _cache


def set_cache(cache: Cache | None) -> None:
    global _cache
    _cache = cache
