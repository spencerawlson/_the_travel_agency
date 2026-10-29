"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Link } from "@/i18n/navigation";
import {
  cancelFareAlert,
  createFareAlert,
  isNative,
  loadLocalAlerts,
  type FareAlert,
} from "@/lib/fare-alerts";
import {
  deleteTrip,
  loadSavedTrips,
  tripLabel,
  tripToPath,
  type SavedTrip,
} from "@/lib/saved-trips";

/**
 * Trips saved on this device. The list itself needs no network — it renders
 * from on-device storage — but re-running a trip fetches live offers, and
 * the prices shown after a re-run are live at that moment, never the price
 * from when the trip was saved (no price is stored).
 */
export function SavedTripsView({ locale }: { locale: string }) {
  const t = useTranslations("app");
  const [trips, setTrips] = useState<SavedTrip[] | null>(null);
  const [alerts, setAlerts] = useState<FareAlert[]>([]);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [native, setNative] = useState(false);

  useEffect(() => {
    setNative(isNative());
    void loadSavedTrips().then(setTrips);
    void loadLocalAlerts().then(setAlerts);
  }, []);

  async function onDelete(id: string) {
    await deleteTrip(id);
    setTrips((prev) => (prev ?? []).filter((trip) => trip.id !== id));
  }

  async function onAlert(trip: SavedTrip) {
    const raw = targets[trip.id] ?? "";
    const target = Number(raw);
    if (!Number.isFinite(target) || target <= 0) {
      setNotice(t("alertInvalidPrice"));
      return;
    }
    setNotice(null);
    const alert = await createFareAlert(trip, target);
    if (!alert) {
      setNotice(
        native ? t("alertUnavailable") : t("alertNeedsApp"),
      );
      return;
    }
    setAlerts((prev) => [alert, ...prev]);
  }

  async function onCancelAlert(alert: FareAlert) {
    await cancelFareAlert(alert);
    setAlerts((prev) => prev.filter((a) => a !== alert));
  }

  if (trips === null) {
    return <p className="text-ink-muted">{t("loading")}</p>;
  }

  if (trips.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-ink-muted">{t("noSavedTrips")}</p>
        <Link href="/flights" locale={locale} className="font-semibold text-brand-600">
          {t("searchFlights")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-ink-muted">{t("savedTripsNote")}</p>
      {notice && (
        <p role="status" className="rounded-xl border border-line bg-surface-1 p-3 text-sm">
          {notice}
        </p>
      )}
      <ul className="space-y-4">
        {trips.map((trip) => {
          const alert = alerts.find((a) => a.trip.id === trip.id);
          return (
            <li key={trip.id} className="rounded-2xl border border-line bg-surface-1 p-4">
              <p className="font-semibold">{tripLabel(trip)}</p>
              <p className="text-sm text-ink-muted">
                {trip.fromLabel} → {trip.toLabel} · {trip.cabin} · {trip.currency}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link
                  href={tripToPath(trip)}
                  locale={locale}
                  className="rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
                >
                  {t("revisitTrip")}
                </Link>
                <button
                  type="button"
                  onClick={() => void onDelete(trip.id)}
                  className="rounded-full border border-line px-4 py-2 text-sm font-semibold"
                >
                  {t("deleteTrip")}
                </button>
              </div>
              {alert ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <span>
                    {t("alertActive", { price: alert.targetPrice, currency: trip.currency })}
                  </span>
                  <button
                    type="button"
                    onClick={() => void onCancelAlert(alert)}
                    className="font-semibold text-brand-600"
                  >
                    {t("alertCancel")}
                  </button>
                </div>
              ) : (
                <form
                  className="mt-3 flex flex-wrap items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void onAlert(trip);
                  }}
                >
                  <label className="text-sm">
                    {t("alertUnder")}
                    <input
                      type="number"
                      min="1"
                      step="1"
                      inputMode="decimal"
                      value={targets[trip.id] ?? ""}
                      onChange={(e) =>
                        setTargets((prev) => ({ ...prev, [trip.id]: e.target.value }))
                      }
                      placeholder={trip.currency}
                      className="ml-2 w-28 rounded-lg border border-line bg-surface-1 px-2 py-1.5"
                    />
                  </label>
                  <button
                    type="submit"
                    className="rounded-full border border-line px-4 py-2 text-sm font-semibold"
                  >
                    {t("alertCreate")}
                  </button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
