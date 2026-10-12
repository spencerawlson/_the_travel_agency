from __future__ import annotations

from app.providers.base import FlightProvider
from app.providers.mock import MockFlightProvider

# Factories for every provider implementation known to the codebase. Phase 2
# adds e.g. "travelpayouts": lambda: TravelpayoutsProvider(settings...).
PROVIDER_FACTORIES: dict[str, type[FlightProvider]] = {
    "mock": MockFlightProvider,
}


class ProviderRegistry:
    def __init__(self, providers: list[FlightProvider]) -> None:
        self._providers = {p.code: p for p in providers}

    @classmethod
    def from_codes(cls, codes: list[str]) -> ProviderRegistry:
        unknown = [c for c in codes if c not in PROVIDER_FACTORIES]
        if unknown:
            raise ValueError(f"Unknown providers in ENABLED_PROVIDERS: {unknown}")
        return cls([PROVIDER_FACTORIES[c]() for c in codes])

    def all(self) -> list[FlightProvider]:
        return list(self._providers.values())

    def get(self, code: str) -> FlightProvider | None:
        return self._providers.get(code)

    async def close(self) -> None:
        for p in self._providers.values():
            await p.close()


_registry: ProviderRegistry | None = None


def init_registry(codes: list[str]) -> ProviderRegistry:
    global _registry
    _registry = ProviderRegistry.from_codes(codes)
    return _registry


def get_registry() -> ProviderRegistry:
    if _registry is None:
        raise RuntimeError("Provider registry not initialised")
    return _registry


def set_registry(registry: ProviderRegistry | None) -> None:
    global _registry
    _registry = registry
