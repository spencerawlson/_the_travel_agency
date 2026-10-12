"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { ApiError } from "./api";

export type RequestState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: ApiError }
  | { status: "success"; data: T };

type Settled<T> = { key: string } & ({ ok: true; data: T } | { ok: false; error: ApiError });

/**
 * Runs `request` whenever `key` changes (null = don't run), aborting stale
 * requests. Loading is derived (latest settled key !== current key), so no
 * state is set synchronously inside the effect.
 */
export function useRequest<T>(
  key: string | null,
  request: (signal: AbortSignal) => Promise<T>,
): RequestState<T> {
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const run = useEffectEvent((signal: AbortSignal) => request(signal));

  useEffect(() => {
    if (key === null) return;
    const controller = new AbortController();
    run(controller.signal).then(
      (data) => setSettled({ key, ok: true, data }),
      (err: unknown) => {
        if ((err as Error).name === "AbortError") return;
        const error = err instanceof ApiError ? err : new ApiError(0, "generic", String(err));
        setSettled({ key, ok: false, error });
      },
    );
    return () => controller.abort();
  }, [key]);

  if (key === null) return { status: "idle" };
  if (!settled || settled.key !== key) return { status: "loading" };
  return settled.ok
    ? { status: "success", data: settled.data }
    : { status: "error", error: settled.error };
}
