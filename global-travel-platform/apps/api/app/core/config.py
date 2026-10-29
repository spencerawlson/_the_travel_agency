"""Application configuration, loaded from environment variables (12-factor).

Secrets are never hard-coded: `SECRET_KEY` and database credentials must be
provided by the environment. Production startup refuses insecure defaults.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

INSECURE_DEV_SECRET = "dev-only-insecure-secret-change-me"  # noqa: S105 - sentinel, rejected in production


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    environment: Literal["development", "test", "production"] = "development"
    app_name: str = "Global Travel Platform API"
    app_version: str = "0.1.0"
    log_level: str = "INFO"
    log_json: bool = True

    database_url: str = "postgresql+psycopg://gtp:gtp@localhost:5432/gtp"
    redis_url: str | None = "redis://localhost:6379/0"

    secret_key: str = INSECURE_DEV_SECRET
    # NoDecode: accept a plain comma-separated env value instead of JSON.
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:3000"]
    )
    enable_docs: bool = True

    # Admin sessions
    session_cookie_name: str = "gtp_admin_session"
    csrf_cookie_name: str = "gtp_csrf"
    cookie_secure: bool = False
    session_ttl_minutes: int = 8 * 60
    session_idle_minutes: int = 60
    login_max_attempts: int = 5
    login_lockout_minutes: int = 15
    # When true, admins must turn on two-step sign-in before using the dashboard.
    admin_require_2fa: bool = False

    # Rate limits: "<requests>/<seconds>"
    rate_limit_default: str = "120/60"
    rate_limit_search: str = "20/60"
    rate_limit_autocomplete: str = "120/60"
    rate_limit_referral: str = "30/60"
    rate_limit_login: str = "10/900"
    rate_limit_push: str = "30/60"

    # APNs (fare-alert pushes). The .p8 key itself is a FILE, never an env
    # value: APNS_KEY_PATH points at it (e.g. /app/secrets/AuthKey_<id>.p8
    # inside the api container, mounted read-only from ./secrets). The ids
    # below are identifiers, not secrets. All four must be set before any
    # push is attempted; the dispatcher refuses to run without them.
    apns_key_id: str | None = None
    apns_team_id: str | None = None
    apns_bundle_id: str | None = None
    apns_key_path: str | None = None
    apns_use_sandbox: bool = False

    # Providers & referrals
    enabled_providers: Annotated[list[str], NoDecode] = Field(default_factory=lambda: ["mock"])
    provider_timeout_seconds: float = 8.0
    offer_ttl_seconds: int = 30 * 60
    # Production referral kill-switch. Must stay false until partner agreements,
    # business model and licensing requirements are verified (docs/COMPLIANCE.md).
    referrals_live_enabled: bool = False
    default_currency: str = "CAD"

    # Travelpayouts (Aviasales flight data). Token is a secret: .env only.
    travelpayouts_api_token: str | None = None
    travelpayouts_marker: str | None = None
    travelpayouts_api_base: str = "https://api.travelpayouts.com"
    travelpayouts_link_base: str = "https://www.aviasales.com"
    # Optional 2-letter market whose price cache to query (e.g. "ca"); empty = API default.
    travelpayouts_market: str | None = None
    travelpayouts_cache_seconds: int = 30 * 60

    # Observability
    sentry_dsn: str | None = None
    metrics_token: str | None = None

    # Data retention (days)
    retention_search_events_days: int = 395
    retention_click_events_days: int = 760
    retention_audit_logs_days: int = 730
    retention_error_events_days: int = 90

    @field_validator("cors_origins", "enabled_providers", mode="before")
    @classmethod
    def _split_csv(cls, v: object) -> object:
        if isinstance(v, str):
            return [item.strip() for item in v.split(",") if item.strip()]
        return v

    @model_validator(mode="after")
    def _production_guards(self) -> Settings:
        if self.environment == "production":
            if self.secret_key == INSECURE_DEV_SECRET or len(self.secret_key) < 32:
                raise ValueError(
                    "SECRET_KEY must be set to a random value of >= 32 chars in production"
                )
            if not self.cookie_secure:
                raise ValueError("COOKIE_SECURE must be true in production")
            if any(o == "*" for o in self.cors_origins):
                raise ValueError("Wildcard CORS origin is not allowed in production")
        return self

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


def parse_rate(spec: str) -> tuple[int, int]:
    """Parse '20/60' into (limit, window_seconds)."""
    limit, window = spec.split("/", 1)
    return int(limit), int(window)
