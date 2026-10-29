import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { PushNotifications } from "@capacitor/push-notifications";

import { apiFetch } from "./api";
import type { SavedTrip } from "./saved-trips";

/**
 * Fare alerts, client side. The app asks for push permission, registers the
 * device token with the backend, and creates an alert rule (route + dates +
 * target price). The backend — not the app — re-checks live fares and sends
 * the push via the APNs dispatcher (apps/api/app/services/apns_dispatch.py,
 * run by `python -m app.cli run-fare-alerts` on a host cron; see
 * docs/fare-alerts.md). Pushes still need the Xcode push capability and a
 * real iPhone — a simulator has no APNs token by design.
 */

export interface FareAlert {
  /** Backend id, once the alert exists server-side. */
  id: string | null;
  trip: SavedTrip;
  /** Notify when the cheapest live offer is at or below this, in trip currency. */
  targetPrice: number;
  /** Local record of when the alert was created. */
  createdAt: string;
}

export const PUSH_TOKEN_KEY = "farelune.pushToken.v1";
export const LOCAL_ALERTS_KEY = "farelune.alerts.v1";

export type PushState = "unavailable" | "denied" | "granted" | "token";

/** True only inside the native shell; push has no web implementation. */
export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

async function readLocalAlerts(): Promise<FareAlert[]> {
  try {
    const { value } = await Preferences.get({ key: LOCAL_ALERTS_KEY });
    if (!value) return [];
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as FareAlert[]) : [];
  } catch {
    return [];
  }
}

export async function loadLocalAlerts(): Promise<FareAlert[]> {
  return readLocalAlerts();
}

async function storeLocalAlerts(alerts: FareAlert[]): Promise<void> {
  await Preferences.set({ key: LOCAL_ALERTS_KEY, value: JSON.stringify(alerts) });
}

/**
 * Ask for push permission and register the device token. Returns the token,
 * or null when push is unavailable, denied, or registration fails (including
 * the iOS Simulator, which has no APNs token).
 */
export async function ensurePushToken(): Promise<string | null> {
  if (!isNative()) return null;
  try {
    const stored = await Preferences.get({ key: PUSH_TOKEN_KEY });
    if (stored.value) return stored.value;
    const check = await PushNotifications.checkPermissions();
    if (check.receive === "denied") return null;
    if (check.receive === "prompt" || check.receive === "prompt-with-rationale") {
      const asked = await PushNotifications.requestPermissions();
      if (asked.receive !== "granted") return null;
    } else if (check.receive !== "granted") {
      return null;
    }
    const token = await new Promise<string | null>((resolve) => {
      const fail = window.setTimeout(() => resolve(null), 15000);
      void PushNotifications.addListener("registration", (res) => {
        window.clearTimeout(fail);
        resolve(res.value);
      });
      void PushNotifications.addListener("registrationError", () => {
        window.clearTimeout(fail);
        resolve(null);
      });
      void PushNotifications.register();
    });
    if (!token) return null;
    await Preferences.set({ key: PUSH_TOKEN_KEY, value: token });
    return token;
  } catch {
    return null;
  }
}

/** Create an alert rule server-side and keep a local copy. Null on failure. */
export async function createFareAlert(
  trip: SavedTrip,
  targetPrice: number,
): Promise<FareAlert | null> {
  if (!Number.isFinite(targetPrice) || targetPrice <= 0) return null;
  const token = await ensurePushToken();
  if (!token) return null;
  try {
    const res = await apiFetch<{ id: string }>("/api/v1/push/alerts", {
      method: "POST",
      body: {
        push_token: token,
        platform: Capacitor.getPlatform(),
        origin: trip.from,
        destination: trip.to,
        trip_type: trip.trip,
        depart_date: trip.depart,
        return_date: trip.returnDate ?? null,
        adults: trip.adults,
        children: trip.children,
        infants: trip.infants,
        cabin: trip.cabin,
        currency: trip.currency,
        target_price: targetPrice,
      },
    });
    const alert: FareAlert = { id: res.id, trip, targetPrice, createdAt: new Date().toISOString() };
    const alerts = await readLocalAlerts();
    await storeLocalAlerts([alert, ...alerts]);
    return alert;
  } catch {
    return null;
  }
}

/** Cancel an alert server-side (when it has an id) and drop the local copy. */
export async function cancelFareAlert(alert: FareAlert): Promise<void> {
  if (alert.id) {
    try {
      const { value } = await Preferences.get({ key: PUSH_TOKEN_KEY });
      await apiFetch(`/api/v1/push/alerts/${alert.id}/cancel`, {
        method: "POST",
        body: { push_token: value ?? "" },
      });
    } catch {
      // Local copy is still dropped: a stale server-side rule expires on its
      // own (depart date passes, or the dispatcher only notifies live trips).
    }
  }
  const alerts = await readLocalAlerts();
  await storeLocalAlerts(
    alerts.filter((a) => !(a.id === alert.id && a.trip.id === alert.trip.id)),
  );
}
