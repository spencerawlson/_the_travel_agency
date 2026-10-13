"""Two-step sign-in for administrators: time-based one-time codes (RFC 6238,
SHA-1, 6 digits, 30 s - what Google/Microsoft Authenticator, 1Password etc.
expect) plus single-use recovery codes.

The shared secret is stored encrypted (Fernet, key derived from SECRET_KEY with
HKDF), so a database leak alone does not reveal it. Rotating SECRET_KEY makes
existing secrets unreadable: reset 2FA for each admin with
`python -m app.cli reset-2fa --email ...` and enrol again.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote, urlencode

import segno
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from app.core.config import get_settings

DIGITS = 6
PERIOD = 30
WINDOW = 1  # accept the previous and next step (clock drift)
RECOVERY_CODES = 10
_RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O, 1/I


def new_secret() -> str:
    """160-bit random secret, base32 without padding (as authenticator apps expect)."""
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def _code(secret: str, step: int) -> str:
    key = base64.b32decode(secret + "=" * (-len(secret) % 8), casefold=True)
    digest = hmac.new(key, struct.pack(">Q", step), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(value % 10**DIGITS).zfill(DIGITS)


def current_step(now: float | None = None) -> int:
    return int((time.time() if now is None else now) // PERIOD)


def code_at(secret: str, now: float | None = None) -> str:
    return _code(secret, current_step(now))


def verify(
    secret: str, code: str, *, last_step: int | None, now: float | None = None
) -> int | None:
    """Return the matched time step, or None. A step at or before `last_step` is
    refused, so an intercepted code cannot be replayed."""
    code = "".join(ch for ch in code if ch.isdigit())
    if len(code) != DIGITS:
        return None
    step = current_step(now)
    for candidate in range(step - WINDOW, step + WINDOW + 1):
        if last_step is not None and candidate <= last_step:
            continue
        if hmac.compare_digest(_code(secret, candidate), code):
            return candidate
    return None


def provisioning_uri(secret: str, account: str, issuer: str) -> str:
    label = quote(f"{issuer}:{account}")
    params = urlencode({"secret": secret, "issuer": issuer, "digits": DIGITS, "period": PERIOD})
    return f"otpauth://totp/{label}?{params}"


def qr_svg_data_uri(uri: str) -> str:
    return segno.make(uri, error="m").svg_data_uri(scale=5, border=2)


# --- secret encryption -------------------------------------------------------


def _fernet() -> Fernet:
    key = HKDF(
        algorithm=hashes.SHA256(), length=32, salt=b"farelune-admin-totp", info=b"totp-secret-v1"
    ).derive(get_settings().secret_key.encode("utf-8"))
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt_secret(secret: str) -> str:
    return _fernet().encrypt(secret.encode()).decode()


def decrypt_secret(token: str) -> str | None:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except (InvalidToken, ValueError):
        return None


# --- recovery codes ----------------------------------------------------------


def new_recovery_codes() -> list[str]:
    """Ten single-use codes like 'K7QF-2MXP', shown to the admin once."""
    out = []
    for _ in range(RECOVERY_CODES):
        raw = "".join(secrets.choice(_RECOVERY_ALPHABET) for _ in range(8))
        out.append(f"{raw[:4]}-{raw[4:]}")
    return out


def normalise_recovery_code(code: str) -> str:
    return "".join(ch for ch in code.upper() if ch.isalnum())


def hash_recovery_code(code: str) -> str:
    """Keyed hash so stored codes are useless without SECRET_KEY."""
    key = get_settings().secret_key.encode("utf-8")
    return hmac.new(key, normalise_recovery_code(code).encode(), hashlib.sha256).hexdigest()


def looks_like_recovery_code(code: str) -> bool:
    return len(normalise_recovery_code(code)) == 8 and not code.strip().isdigit()
