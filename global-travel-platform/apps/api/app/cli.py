"""Operational commands.

python -m app.cli seed                       # idempotent reference data
python -m app.cli create-admin --email a@b.c --role admin   (password prompted
                                             or ADMIN_PASSWORD env var)
python -m app.cli ensure-dev-admin           # development only, from env
python -m app.cli purge-expired              # data retention job
"""

from __future__ import annotations

import argparse
import asyncio
import getpass
import os
import sys

from sqlalchemy import select

from app.core.config import get_settings
from app.core.security import PasswordPolicyError, hash_password, validate_password_policy
from app.db.session import dispose_engine, get_sessionmaker
from app.models import AdminUser
from app.models.admin import ROLES
from app.seed.seed import seed_reference_data
from app.services.audit import audit
from app.services.retention import purge_expired


async def _seed() -> None:
    async with get_sessionmaker()() as session:
        counts = await seed_reference_data(session)
    print("seeded:", counts)


async def _upsert_admin(email: str, password: str, role: str, *, update_existing: bool) -> str:
    email = email.strip().lower()
    validate_password_policy(password, email)
    async with get_sessionmaker()() as session:
        user = (await session.scalars(select(AdminUser).where(AdminUser.email == email))).first()
        if user and not update_existing:
            return "exists"
        if user is None:
            user = AdminUser(email=email, password_hash=hash_password(password), role=role)
            session.add(user)
            await session.flush()
            audit(
                session,
                "admin.user_created",
                actor_label="cli",
                target_type="admin_user",
                target_id=user.id,
                details={"role": role},
            )
            result = "created"
        else:
            from datetime import UTC, datetime

            user.password_hash = hash_password(password)
            user.role = role
            user.password_changed_at = datetime.now(UTC)
            audit(
                session,
                "admin.user_updated",
                actor_label="cli",
                target_type="admin_user",
                target_id=user.id,
                details={"role": role},
            )
            result = "updated"
        await session.commit()
        return result


async def _set_admin_active(email: str, active: bool) -> str:
    """Enable/disable an admin. Disabling also revokes all of their sessions."""
    from datetime import UTC, datetime

    from sqlalchemy import update

    from app.models import AdminSession

    email = email.strip().lower()
    async with get_sessionmaker()() as session:
        user = (await session.scalars(select(AdminUser).where(AdminUser.email == email))).first()
        if user is None:
            return "not found"
        user.is_active = active
        if not active:
            await session.execute(
                update(AdminSession)
                .where(AdminSession.user_id == user.id, AdminSession.revoked_at.is_(None))
                .values(revoked_at=datetime.now(UTC))
            )
        audit(
            session,
            "admin.user_enabled" if active else "admin.user_disabled",
            actor_label="cli",
            target_type="admin_user",
            target_id=user.id,
        )
        await session.commit()
        return "enabled" if active else "disabled"


async def _purge() -> None:
    async with get_sessionmaker()() as session:
        print("purged:", await purge_expired(session))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="app.cli")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("seed")
    ca = sub.add_parser("create-admin")
    ca.add_argument("--email", required=True)
    ca.add_argument("--role", choices=ROLES, default="admin")
    ca.add_argument("--update", action="store_true", help="reset password/role if exists")
    for name in ("disable-admin", "enable-admin"):
        cmd = sub.add_parser(name)
        cmd.add_argument("--email", required=True)
    sub.add_parser("ensure-dev-admin")
    sub.add_parser("purge-expired")
    args = parser.parse_args(argv)

    async def run() -> int:
        try:
            if args.cmd == "seed":
                await _seed()
            elif args.cmd == "create-admin":
                password = os.environ.get("ADMIN_PASSWORD") or getpass.getpass("Password: ")
                print(
                    await _upsert_admin(
                        args.email, password, args.role, update_existing=args.update
                    )
                )
            elif args.cmd == "ensure-dev-admin":
                if get_settings().environment != "development":
                    print("ensure-dev-admin is only available in development", file=sys.stderr)
                    return 2
                dev_email = os.environ.get("DEV_ADMIN_EMAIL")
                dev_password = os.environ.get("DEV_ADMIN_PASSWORD")
                if not dev_email or not dev_password:
                    print("DEV_ADMIN_EMAIL / DEV_ADMIN_PASSWORD not set; skipping")
                    return 0
                print(
                    "dev admin:",
                    await _upsert_admin(dev_email, dev_password, "admin", update_existing=False),
                )
            elif args.cmd in ("disable-admin", "enable-admin"):
                result = await _set_admin_active(args.email, args.cmd == "enable-admin")
                print(result)
                return 1 if result == "not found" else 0
            elif args.cmd == "purge-expired":
                await _purge()
            return 0
        except PasswordPolicyError as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 2
        finally:
            await dispose_engine()

    return asyncio.run(run())


if __name__ == "__main__":
    sys.exit(main())
