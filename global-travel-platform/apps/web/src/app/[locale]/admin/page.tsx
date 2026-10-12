import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Dashboard } from "@/components/admin/Dashboard";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

/** Internal dashboard. Data comes only from authenticated API calls (cookie
 * session + RBAC enforced server-side); this page renders no data on its own. */
export default async function AdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <Dashboard />
    </div>
  );
}
