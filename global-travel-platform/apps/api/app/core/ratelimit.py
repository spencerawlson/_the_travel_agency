"""Fixed-window rate limiting backed by Redis (shared across API replicas).

Clients are identified by the keyed client hash of their IP. The real client
IP is resolved by uvicorn's --proxy-headers from the trusted reverse proxy
(see infrastructure/nginx and FORWARDED_ALLOW_IPS)."""

from __future__ import annotations

import logging
import time
from collections.abc import Awaitable, Callable

from fastapi import Request

from app.core.cache import get_cache
from app.core.config import get_settings, parse_rate
from app.core.errors import RateLimitedError
from app.core.security import client_hash

logger = logging.getLogger("app.ratelimit")


def client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def rate_limit(bucket: str, setting_name: str) -> Callable[[Request], Awaitable[None]]:
    async def _dependency(request: Request) -> None:
        limit, window = parse_rate(getattr(get_settings(), setting_name))
        ident = client_hash(client_ip(request)) or "anonymous"
        window_id = int(time.time() // window)
        key = f"rl:{bucket}:{ident}:{window_id}"
        try:
            count = await get_cache().incr_window(key, window)
        except Exception:  # fail open: availability over strictness if Redis blips
            logger.warning("rate_limit_backend_unavailable", extra={"bucket": bucket})
            return
        if count > limit:
            retry_after = window - int(time.time() % window)
            raise RateLimitedError(
                "Too many requests, please slow down",
                headers={"Retry-After": str(retry_after)},
            )

    return _dependency
