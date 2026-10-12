"""Prometheus metrics (exposed at /api/v1/metrics, token-protected)."""

from __future__ import annotations

from prometheus_client import CollectorRegistry, Counter, Histogram, generate_latest

registry = CollectorRegistry()

http_requests = Counter(
    "gtp_http_requests_total",
    "HTTP requests",
    ["method", "route", "status"],
    registry=registry,
)
http_latency = Histogram(
    "gtp_http_request_duration_seconds",
    "HTTP request latency",
    ["route"],
    buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10),
    registry=registry,
)
flight_searches = Counter(
    "gtp_flight_searches_total", "Flight searches by status", ["status"], registry=registry
)
provider_errors = Counter(
    "gtp_provider_errors_total", "Provider errors", ["provider", "kind"], registry=registry
)
referral_clicks = Counter(
    "gtp_referral_clicks_total", "Referral clicks by status", ["status"], registry=registry
)


def observe_request(method: str, route: str, status: int, seconds: float) -> None:
    http_requests.labels(method, route, str(status)).inc()
    http_latency.labels(route).observe(seconds)


def render() -> bytes:
    return generate_latest(registry)
