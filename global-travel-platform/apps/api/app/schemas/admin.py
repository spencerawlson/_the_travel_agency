from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class LoginIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=256)
    # Second step: 6-digit authenticator code or a recovery code (XXXX-XXXX).
    otp: str | None = Field(default=None, max_length=16)


class AdminUserOut(BaseModel):
    id: int
    email: str
    role: str
    last_login_at: datetime | None
    two_factor_enabled: bool = False


class SessionOut(BaseModel):
    user: AdminUserOut
    expires_at: datetime
    csrf_token: str | None = None
    # ADMIN_REQUIRE_2FA is on: the dashboard stays locked until 2FA is set up.
    two_factor_required: bool = False


class TwoFactorSetupOut(BaseModel):
    secret: str
    otpauth_uri: str
    qr_svg: str  # data: URI


class TwoFactorCodeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(min_length=6, max_length=16)


class TwoFactorDisableIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    password: str = Field(min_length=1, max_length=256)
    code: str = Field(min_length=6, max_length=16)


class RecoveryCodesOut(BaseModel):
    recovery_codes: list[str]


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


class SearchEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    created_at: datetime
    origin_iata: str
    destination_iata: str
    trip_type: str
    depart_date: date
    return_date: date | None
    adults: int
    children: int
    infants: int
    cabin: str
    currency: str
    locale: str
    result_count: int
    status: str
    latency_ms: int
    is_demo: bool


class ReferralEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    created_at: datetime
    search_event_id: uuid.UUID | None
    provider_code: str
    offer_id: str
    origin_iata: str
    destination_iata: str
    price_amount: Decimal | None
    price_currency: str | None
    is_demo: bool
    redirect_host: str | None
    status: str
    locale: str


class CommissionOut(BaseModel):
    id: uuid.UUID
    provider_code: str
    referral_click_id: uuid.UUID | None
    external_reference: str
    status: str
    amount: Decimal
    currency: str
    booking_date: date | None
    period_start: date | None
    period_end: date | None
    reported_at: datetime
    source: str


class CommissionTotal(BaseModel):
    status: str
    currency: str
    count: int
    amount: Decimal


class CommissionPage(Page[CommissionOut]):
    totals: list[CommissionTotal]


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
    actor_user_id: int | None
    actor_label: str | None
    action: str
    target_type: str | None
    target_id: str | None
    outcome: str
    details: dict
