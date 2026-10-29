"""APNs dispatcher: sends evaluator-decided fare alerts to iOS devices.

Takes the `PendingNotification` rows `evaluate_alerts()` returns and sends
each one to Apple Push Notification service (APNs) over HTTP/2, authenticated
with a JWT signed by the team's .p8 key (ES256). Rules, all deliberate:

- Only iOS tokens are sent. Android/web tokens have no rail yet and are
  counted as skipped, never failed and never deleted.
- Only LIVE prices reach a device: the evaluator already guarantees that
  (demo offers never count), and this module never invents a price — it
  sends exactly the evaluator's price.
- A token APNs reports invalid (410 Gone, or 400 BadDeviceToken) has its
  device row deleted; its alerts go with it via the CASCADE. Any other
  failure never deletes a device.
- Transient APNs failures (429, 5xx) are retried twice, honouring
  Retry-After (capped at 60s), then counted as failed and logged.
- Push tokens are NEVER logged. Logs carry alert ids only.
- Failed sends are NOT re-queued by this module: the evaluator already
  stamped `last_notified_price` when it decided, so a failed send means
  that drop is missed and the alert fires again only on a further drop.
  That is the once-per-drop rule working as designed, not a bug to patch
  around by re-sending from here.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import time
from dataclasses import dataclass
from pathlib import Path

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models.push import PushDevice
from app.services.fare_alerts import PendingNotification

logger = logging.getLogger("app.apns_dispatch")

APNS_PRODUCTION_HOST = "api.push.apple.com"
APNS_SANDBOX_HOST = "api.sandbox.push.apple.com"
MAX_ATTEMPTS = 3
MAX_RETRY_AFTER_SECONDS = 60


class ApnsConfigError(ValueError):
    """APNs is not configured (missing ids, key path, or key file)."""


def apns_configured(settings: Settings) -> bool:
    """True only when every APNs setting is present and the key file exists."""
    if not (
        settings.apns_key_id
        and settings.apns_team_id
        and settings.apns_bundle_id
        and settings.apns_key_path
    ):
        return False
    return Path(settings.apns_key_path).is_file()


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def build_provider_jwt(settings: Settings) -> str:
    """Short-lived (30 min) provider token, ES256-signed with the .p8 key."""
    if not apns_configured(settings):
        raise ApnsConfigError(
            "APNs not configured: set APNS_KEY_ID, APNS_TEAM_ID, "
            "APNS_BUNDLE_ID and APNS_KEY_PATH (file must exist)"
        )
    key_bytes = Path(str(settings.apns_key_path)).read_bytes()
    private_key = serialization.load_pem_private_key(key_bytes, password=None)
    if not isinstance(private_key, ec.EllipticCurvePrivateKey):
        raise ApnsConfigError("APNs key is not an EC private key (.p8)")
    header = {"alg": "ES256", "kid": settings.apns_key_id, "typ": "JWT"}
    now = int(time.time())
    claims = {"iss": settings.apns_team_id, "iat": now, "exp": now + 30 * 60}
    signing_input = (
        _b64url(json.dumps(header, separators=(",", ":")).encode())
        + "."
        + _b64url(json.dumps(claims, separators=(",", ":")).encode())
    )
    signature = private_key.sign(
        signing_input.encode(), ec.ECDSA(hashes.SHA256())
    )
    return signing_input + "." + _b64url(signature)


def _payload(notification: PendingNotification) -> dict:
    body = (
        f"{notification.origin} → {notification.destination} "
        f"now {notification.price} {notification.currency} · "
        f"departs {notification.depart_date.isoformat()}"
    )
    return {"aps": {"alert": {"title": "Farelune fare alert", "body": body}, "sound": "default"}}


@dataclass
class DispatchResult:
    sent: int = 0
    failed: int = 0
    skipped: int = 0
    devices_removed: int = 0


async def _send_one(
    client: httpx.AsyncClient,
    host: str,
    jwt: str,
    bundle_id: str,
    notification: PendingNotification,
) -> str:
    """Returns 'sent', 'invalid' (delete the device) or 'failed'."""
    url = f"https://{host}/3/device/{notification.push_token}"
    headers = {
        "authorization": f"bearer {jwt}",
        "apns-topic": bundle_id,
        "apns-push-type": "alert",
        "apns-priority": "10",
    }
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            response = await client.post(url, headers=headers, json=_payload(notification))
        except httpx.HTTPError:
            logger.warning(
                "apns_transport_error",
                extra={"alert_id": notification.alert_id, "attempt": attempt},
            )
            if attempt == MAX_ATTEMPTS:
                return "failed"
            await asyncio.sleep(min(2**attempt, MAX_RETRY_AFTER_SECONDS))
            continue
        if response.status_code == 200:
            return "sent"
        if response.status_code == 410:
            return "invalid"
        if response.status_code == 400:
            try:
                reason = response.json().get("reason")
            except ValueError:
                reason = None
            if reason == "BadDeviceToken":
                return "invalid"
            logger.warning(
                "apns_rejected",
                extra={"alert_id": notification.alert_id, "reason": reason},
            )
            return "failed"
        if response.status_code in (429, 500, 502, 503):
            if attempt == MAX_ATTEMPTS:
                return "failed"
            retry_after = response.headers.get("retry-after")
            try:
                delay = min(int(retry_after), MAX_RETRY_AFTER_SECONDS) if retry_after else 2**attempt
            except ValueError:
                delay = 2**attempt
            await asyncio.sleep(delay)
            continue
        logger.warning(
            "apns_unexpected_status",
            extra={"alert_id": notification.alert_id, "status": response.status_code},
        )
        return "failed"
    return "failed"


async def dispatch_pending(
    session: AsyncSession,
    settings: Settings,
    pending: list[PendingNotification],
    client: httpx.AsyncClient | None = None,
) -> DispatchResult:
    """Send pending iOS notifications; delete devices APNs reports invalid."""
    if not apns_configured(settings):
        raise ApnsConfigError(
            "APNs not configured: set APNS_KEY_ID, APNS_TEAM_ID, "
            "APNS_BUNDLE_ID and APNS_KEY_PATH (file must exist)"
        )
    host = APNS_SANDBOX_HOST if settings.apns_use_sandbox else APNS_PRODUCTION_HOST
    jwt = build_provider_jwt(settings)
    own_client = client is None
    if own_client:
        client = httpx.AsyncClient(http2=True, timeout=30.0)
    assert client is not None
    result = DispatchResult()
    try:
        for notification in pending:
            if notification.platform != "ios":
                result.skipped += 1
                continue
            outcome = await _send_one(
                client, host, jwt, str(settings.apns_bundle_id), notification
            )
            if outcome == "sent":
                result.sent += 1
            elif outcome == "invalid":
                device = (
                    await session.scalars(
                        select(PushDevice).where(
                            PushDevice.push_token == notification.push_token
                        )
                    )
                ).first()
                if device is not None:
                    await session.delete(device)
                    result.devices_removed += 1
                result.failed += 1
            else:
                result.failed += 1
    finally:
        if own_client:
            await client.aclose()
    if result.devices_removed:
        await session.commit()
    return result
