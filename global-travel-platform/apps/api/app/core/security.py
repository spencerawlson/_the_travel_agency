"""Password hashing, opaque tokens, and privacy-preserving client hashing."""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import UTC, datetime

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.core.config import get_settings

# Argon2id with OWASP-recommended parameters (m=19 MiB, t=2, p=1 is the floor;
# we use more memory).
_hasher = PasswordHasher(time_cost=3, memory_cost=64 * 1024, parallelism=2)

# Dummy hash used to equalise timing when the account does not exist.
_DUMMY_HASH = _hasher.hash(secrets.token_urlsafe(16))

MIN_PASSWORD_LENGTH = 12
_COMMON_PASSWORDS = {
    "password1234",
    "123456789012",
    "qwertyuiop12",
    "administrator",
    "changemechangeme",
    "letmein12345",
    "password123!",
}


class PasswordPolicyError(ValueError):
    pass


def validate_password_policy(password: str, email: str | None = None) -> None:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise PasswordPolicyError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters")
    if len(password) > 256:
        raise PasswordPolicyError("Password is too long")
    if password.lower() in _COMMON_PASSWORDS:
        raise PasswordPolicyError("Password is too common")
    if email and email.split("@")[0].lower() in password.lower():
        raise PasswordPolicyError("Password must not contain the email name")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


def new_token() -> str:
    return secrets.token_urlsafe(32)


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def client_hash(ip: str | None, *, now: datetime | None = None) -> str | None:
    """Daily-rotating keyed hash of the client IP. The raw IP is never stored."""
    if not ip:
        return None
    day = (now or datetime.now(UTC)).strftime("%Y-%m-%d")
    key = get_settings().secret_key.encode("utf-8")
    return hmac.new(key, f"{day}|{ip}".encode(), hashlib.sha256).hexdigest()[:32]


def constant_time_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))
