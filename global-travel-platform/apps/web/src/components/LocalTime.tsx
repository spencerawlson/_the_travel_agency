"use client";

import { useLocale } from "next-intl";
import { useSyncExternalStore } from "react";
import { intlLocale } from "@/lib/format";

// A shared once-a-minute clock.
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
function subscribe(cb: () => void) {
  listeners.add(cb);
  timer ??= setInterval(() => listeners.forEach((l) => l()), 30_000);
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}
const minuteNow = () => Math.floor(Date.now() / 60_000);

/** Current wall-clock time in a destination's IANA time zone (client-only to
 * avoid server/client clock mismatches). */
export function LocalTime({ timeZone }: { timeZone: string }) {
  const locale = useLocale();
  const minute = useSyncExternalStore(subscribe, minuteNow, () => null);
  if (minute === null) return <span>—</span>;
  return (
    <time>
      {new Intl.DateTimeFormat(intlLocale(locale), {
        hour: "numeric",
        minute: "2-digit",
        weekday: "short",
        timeZone,
      }).format(new Date(minute * 60_000))}
    </time>
  );
}
