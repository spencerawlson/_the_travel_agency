"""Import every model so Base.metadata is complete (Alembic autogenerate, tests)."""

from app.models.admin import AdminSession, AdminUser, AppSetting, AuditLog
from app.models.commerce import AffiliateProvider, CommissionReport, Currency, ExchangeRateRecord
from app.models.events import FlightSearchEvent, ReferralClickEvent, SystemErrorEvent
from app.models.geo import Airport, City, Country, Destination
from app.models.push import FareAlert, PushDevice

__all__ = [
    "AdminSession",
    "AdminUser",
    "AffiliateProvider",
    "Airport",
    "AppSetting",
    "AuditLog",
    "City",
    "CommissionReport",
    "Country",
    "Currency",
    "Destination",
    "ExchangeRateRecord",
    "FlightSearchEvent",
    "ReferralClickEvent",
    "SystemErrorEvent",
    "FareAlert",
    "PushDevice",
]
