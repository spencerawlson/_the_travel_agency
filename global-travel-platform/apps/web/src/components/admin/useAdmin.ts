"use client";

import type { AdminSession } from "@gtp/shared-types";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { apiFetch } from "@/lib/api";
import { useRequest } from "@/lib/useRequest";

/** Loads the current admin session; redirects to the login page when absent. */
export function useAdminSession() {
  const router = useRouter();
  const [session, setSession] = useState<AdminSession | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiFetch<AdminSession>("/api/v1/admin/auth/me")
      .then((s) => !cancelled && setSession(s))
      .catch(() => !cancelled && router.replace("/admin/login"));
    return () => {
      cancelled = true;
    };
  }, [router, version]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  const signOut = useCallback(async () => {
    try {
      await apiFetch("/api/v1/admin/auth/logout", { method: "POST" });
    } finally {
      router.replace("/admin/login");
    }
  }, [router]);

  return { session, signOut, refresh };
}

export type LoadState<T> =
  | { kind: "loading" }
  | { kind: "error"; status: number; code: string }
  | { kind: "ready"; data: T };

/** GET an admin resource, re-fetching when `path` changes. A 401 sends the
 * user back to the login page. */
export function useAdminResource<T>(path: string): LoadState<T> {
  const router = useRouter();
  const request = useRequest<T>(path, (signal) => apiFetch<T>(path, { signal }));
  const expired = request.status === "error" && request.error.status === 401;

  useEffect(() => {
    if (expired) router.replace("/admin/login?expired=1");
  }, [expired, router]);

  if (request.status === "success") return { kind: "ready", data: request.data };
  if (request.status === "error" && !expired)
    return { kind: "error", status: request.error.status, code: request.error.code };
  return { kind: "loading" };
}
