from __future__ import annotations

import logging
import re
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import get_settings
from app.core.logging import request_id_var
from app.core.metrics import observe_request

logger = logging.getLogger("app.request")

_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._-]{8,64}$")
MAX_BODY_BYTES = 64 * 1024


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Request id propagation, body-size guard, access log, metrics, security headers."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        incoming = request.headers.get("x-request-id", "")
        rid = incoming if _REQUEST_ID_RE.match(incoming) else uuid.uuid4().hex
        request.state.request_id = rid
        token = request_id_var.set(rid)
        start = time.perf_counter()
        try:
            length = request.headers.get("content-length")
            if length and length.isdigit() and int(length) > MAX_BODY_BYTES:
                response: Response = Response(
                    '{"error":{"code":"payload_too_large","message":"Request body too large"}}',
                    status_code=413,
                    media_type="application/json",
                )
            else:
                response = await call_next(request)
        finally:
            request_id_var.reset(token)
        elapsed = time.perf_counter() - start

        route = request.scope.get("route")
        route_path = getattr(route, "path", "unmatched")
        observe_request(request.method, route_path, response.status_code, elapsed)
        logger.info(
            "request",
            extra={
                "request_id": rid,
                "method": request.method,
                "path": route_path,
                "status": response.status_code,
                "duration_ms": round(elapsed * 1000, 1),
            },
        )
        _apply_security_headers(request, response)
        response.headers["X-Request-ID"] = rid
        return response


def _apply_security_headers(request: Request, response: Response) -> None:
    h = response.headers
    h.setdefault("X-Content-Type-Options", "nosniff")
    h.setdefault("X-Frame-Options", "DENY")
    h.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    h.setdefault("Permissions-Policy", "geolocation=(), camera=(), microphone=(), payment=()")
    h.setdefault("Cross-Origin-Opener-Policy", "same-origin")
    h.setdefault("Cross-Origin-Resource-Policy", "same-origin")
    if not request.url.path.startswith("/api/docs"):
        h.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
    if request.url.path.startswith("/api/v1/admin"):
        h["Cache-Control"] = "no-store"
    if get_settings().cookie_secure:
        h.setdefault("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
