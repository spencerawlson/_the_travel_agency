"use client";

import type {
  AdminOverview,
  CommissionPage,
  Page,
  ReferralEvent,
  SearchEvent,
} from "@gtp/shared-types";
import { Badge, Button, Card } from "@gtp/ui";
import { useLocale, useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { formatMoney, formatPercent, intlLocale } from "@/lib/format";
import { BarTrend } from "./BarTrend";
import { type LoadState, useAdminResource, useAdminSession } from "./useAdmin";

type Tab = "overview" | "searches" | "referrals" | "commissions";
const TABS: Tab[] = ["overview", "searches", "referrals", "commissions"];
const PAGE_SIZE = 25;

export function Dashboard() {
  const t = useTranslations("admin");
  const { session, signOut } = useAdminSession();
  const [tab, setTab] = useState<Tab>("overview");

  if (!session) return <p className="text-ink-muted">{t("loading")}</p>;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-ink-muted">
            {t("signedInAs", { email: session.user.email, role: session.user.role })}
          </p>
        </div>
        <Button variant="secondary" onClick={signOut}>
          {t("signOut")}
        </Button>
      </header>
      <div
        role="tablist"
        aria-label={t("title")}
        className="flex gap-1 overflow-x-auto border-b border-line"
      >
        {TABS.map((key) => (
          <button
            key={key}
            role="tab"
            id={`tab-${key}`}
            aria-selected={tab === key}
            aria-controls={`panel-${key}`}
            onClick={() => setTab(key)}
            className="border-b-2 border-transparent px-4 py-2 text-sm font-semibold text-ink-muted aria-selected:border-brand-600 aria-selected:text-ink"
          >
            {t(`tabs.${key}`)}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "overview" && <Overview />}
        {tab === "searches" && <SearchesTable />}
        {tab === "referrals" && <ReferralsTable />}
        {tab === "commissions" && <CommissionsTable />}
      </div>
    </div>
  );
}

function StateGuard<T>({
  state,
  children,
}: {
  state: LoadState<T>;
  children: (data: T) => ReactNode;
}) {
  const t = useTranslations("admin");
  if (state.kind === "loading") return <p className="text-ink-muted">{t("loading")}</p>;
  if (state.kind === "error")
    return (
      <p role="alert" className="text-red-700">
        {state.status === 403 ? t("forbidden") : state.code}
      </p>
    );
  return <>{children(state.data)}</>;
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </Card>
  );
}

function Overview() {
  const t = useTranslations("admin");
  const locale = useLocale();
  const [days, setDays] = useState(30);
  const state = useAdminResource<AdminOverview>(`/api/v1/admin/overview?days=${days}`);
  const n = (v: number) => new Intl.NumberFormat(intlLocale(locale)).format(v);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-sm text-ink-muted">{t("dataNote")}</p>
        <label className="flex items-center gap-2 text-sm font-medium">
          {t("period")}
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-lg border border-line bg-surface-1 px-2 py-1.5"
          >
            {[7, 30, 90].map((d) => (
              <option key={d} value={d}>
                {t("days", { count: d })}
              </option>
            ))}
          </select>
        </label>
      </div>
      <StateGuard state={state}>
        {(o) => {
          const blocked = o.totals.referral_clicks - o.totals.redirected_clicks;
          return (
            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <Kpi
                  label={t("kpi.searches")}
                  value={n(o.totals.searches)}
                  hint={t("kpi.searchesDemo", { count: n(o.totals.searches_demo) })}
                />
                <Kpi
                  label={t("kpi.clicks")}
                  value={n(o.totals.redirected_clicks)}
                  hint={blocked > 0 ? t("kpi.clicksBlocked", { count: n(blocked) }) : undefined}
                />
                <Kpi
                  label={t("kpi.ctr")}
                  value={formatPercent(o.totals.click_through_rate, locale, t("kpi.na"))}
                  hint={t("kpi.ctrHint")}
                />
                <Kpi
                  label={t("kpi.conversion")}
                  value={formatPercent(o.totals.click_to_commission_rate, locale, t("kpi.na"))}
                  hint={t("kpi.conversionHint")}
                />
                <Kpi
                  label={t("kpi.visitors")}
                  value={n(o.totals.approx_unique_daily_visitors)}
                  hint={t("kpi.visitorsHint")}
                />
                <Kpi label={t("kpi.errors")} value={n(o.errors.total)} />
              </div>

              <Card>
                <h2 className="mb-4 font-semibold">{t("trend")}</h2>
                <div className="grid gap-6 lg:grid-cols-2">
                  <BarTrend
                    title={t("trendSearches")}
                    tableLabel={t("trendSearches")}
                    points={o.trend.map((p) => ({ date: p.date, value: p.searches }))}
                  />
                  <BarTrend
                    title={t("trendClicks")}
                    tableLabel={t("trendClicks")}
                    points={o.trend.map((p) => ({ date: p.date, value: p.clicks }))}
                  />
                </div>
              </Card>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <h2 className="mb-3 font-semibold">{t("topDestinations")}</h2>
                  <SimpleTable
                    head={[t("col.route"), t("col.searches")]}
                    rows={o.top_destinations.map((d) => [`${d.city} (${d.iata})`, n(d.searches)])}
                  />
                </Card>
                <Card>
                  <h2 className="mb-3 font-semibold">{t("popularRoutes")}</h2>
                  <SimpleTable
                    head={[t("col.route"), t("col.searches")]}
                    rows={o.popular_routes.map((r) => [
                      `${r.origin} → ${r.destination}`,
                      n(r.searches),
                    ])}
                  />
                </Card>
              </div>

              <Card>
                <h2 className="mb-3 font-semibold">{t("commissions")}</h2>
                {o.commissions.length === 0 ? (
                  <p className="text-sm text-ink-muted">{t("commissionsEmpty")}</p>
                ) : (
                  <SimpleTable
                    head={[t("col.status"), t("col.count"), t("col.amount")]}
                    rows={o.commissions.map((c) => [
                      t(`statuses.${c.status}`),
                      n(c.count),
                      formatMoney(c.amount, c.currency, locale),
                    ])}
                  />
                )}
              </Card>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <h2 className="mb-3 font-semibold">{t("providers")}</h2>
                  <SimpleTable
                    head={[
                      t("col.provider"),
                      t("col.status"),
                      t("col.agreement"),
                      t("col.clicks"),
                      t("col.errors"),
                    ]}
                    rows={o.providers.map((p) => [
                      <span key="n" className="flex items-center gap-2">
                        {p.name}
                        {p.is_demo && <Badge tone="demo">{t("col.demo")}</Badge>}
                      </span>,
                      p.status,
                      p.agreement_verified ? t("verified") : t("notVerified"),
                      n(p.clicks),
                      n(p.errors),
                    ])}
                  />
                </Card>
                <Card>
                  <h2 className="mb-3 font-semibold">{t("system")}</h2>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    {(
                      [
                        ["Database", o.system.database],
                        ["Redis", o.system.redis],
                        ["Providers", o.system.enabled_providers.join(", ")],
                        ["Demo mode", o.system.demo_mode ? t("yes") : t("no")],
                        ["Live referrals", o.system.referrals_live_enabled ? t("yes") : t("no")],
                        ["Environment", o.system.environment],
                        ["Version", o.system.version],
                      ] as const
                    ).map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="text-ink-muted">{k}</dt>
                        <dd className="font-medium">
                          {v === "ok" ? (
                            <Badge tone="success">✓ ok</Badge>
                          ) : v === "error" ? (
                            <Badge tone="danger">✕ error</Badge>
                          ) : (
                            v
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </Card>
              </div>

              <Card>
                <h2 className="mb-3 font-semibold">{t("recentErrors")}</h2>
                {o.errors.recent.length === 0 ? (
                  <p className="text-sm text-ink-muted">{t("noErrors")}</p>
                ) : (
                  <SimpleTable
                    head={[t("col.time"), t("col.source"), t("col.code"), t("col.message")]}
                    rows={o.errors.recent.map((e) => [
                      new Date(e.created_at).toLocaleString(intlLocale(locale)),
                      e.provider_code ? `${e.source}:${e.provider_code}` : e.source,
                      e.code,
                      e.message,
                    ])}
                  />
                )}
              </Card>
            </div>
          );
        }}
      </StateGuard>
    </div>
  );
}

function SimpleTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  const t = useTranslations("admin");
  if (rows.length === 0) return <p className="text-sm text-ink-muted">{t("empty")}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-xs text-ink-muted uppercase">
            {head.map((h) => (
              <th key={h} scope="col" className="py-2 pr-4 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-line">
              {row.map((cell, j) => (
                <td key={j} className="py-2 pr-4 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pager({
  page,
  total,
  onChange,
}: {
  page: number;
  total: number;
  onChange: (p: number) => void;
}) {
  const t = useTranslations("admin");
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      <span className="text-ink-muted">{t("pageOf", { page, pages })}</span>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          {t("prev")}
        </Button>
        <Button variant="secondary" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          {t("next")}
        </Button>
      </div>
    </div>
  );
}

function useTime() {
  const locale = useLocale();
  return (iso: string) =>
    new Date(iso).toLocaleString(intlLocale(locale), { dateStyle: "short", timeStyle: "short" });
}

function SearchesTable() {
  const t = useTranslations("admin");
  const search = useTranslations("search");
  const time = useTime();
  const [page, setPage] = useState(1);
  const state = useAdminResource<Page<SearchEvent>>(
    `/api/v1/admin/searches?page=${page}&page_size=${PAGE_SIZE}`,
  );
  return (
    <StateGuard state={state}>
      {(data) => (
        <Card>
          <SimpleTable
            head={[
              t("col.time"),
              t("col.route"),
              t("col.dates"),
              t("col.pax"),
              t("col.cabin"),
              t("col.results"),
              t("col.status"),
              t("col.latency"),
            ]}
            rows={data.items.map((s) => [
              time(s.created_at),
              `${s.origin_iata} → ${s.destination_iata}`,
              s.return_date ? `${s.depart_date} – ${s.return_date}` : s.depart_date,
              String(s.adults + s.children + s.infants),
              search(`cabins.${s.cabin}`),
              String(s.result_count),
              <span key="s" className="flex gap-1">
                {s.status}
                {s.is_demo && <Badge tone="demo">{t("col.demo")}</Badge>}
              </span>,
              `${s.latency_ms} ms`,
            ])}
          />
          <Pager page={page} total={data.total} onChange={setPage} />
        </Card>
      )}
    </StateGuard>
  );
}

function ReferralsTable() {
  const t = useTranslations("admin");
  const locale = useLocale();
  const time = useTime();
  const [page, setPage] = useState(1);
  const state = useAdminResource<Page<ReferralEvent>>(
    `/api/v1/admin/referrals?page=${page}&page_size=${PAGE_SIZE}`,
  );
  return (
    <StateGuard state={state}>
      {(data) => (
        <Card>
          <SimpleTable
            head={[
              t("col.time"),
              t("col.route"),
              t("col.provider"),
              t("col.price"),
              t("col.host"),
              t("col.status"),
            ]}
            rows={data.items.map((r) => [
              time(r.created_at),
              `${r.origin_iata} → ${r.destination_iata}`,
              r.provider_code,
              r.price_amount && r.price_currency
                ? formatMoney(r.price_amount, r.price_currency, locale)
                : "—",
              r.redirect_host ?? (r.is_demo ? "(internal demo page)" : "—"),
              <span key="s" className="flex gap-1">
                {r.status}
                {r.is_demo && <Badge tone="demo">{t("col.demo")}</Badge>}
              </span>,
            ])}
          />
          <Pager page={page} total={data.total} onChange={setPage} />
        </Card>
      )}
    </StateGuard>
  );
}

function CommissionsTable() {
  const t = useTranslations("admin");
  const locale = useLocale();
  const time = useTime();
  const [page, setPage] = useState(1);
  const state = useAdminResource<CommissionPage>(
    `/api/v1/admin/commissions?page=${page}&page_size=${PAGE_SIZE}`,
  );
  return (
    <StateGuard state={state}>
      {(data) => (
        <div className="space-y-4">
          {data.totals.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {data.totals.map((tot) => (
                <Kpi
                  key={`${tot.status}-${tot.currency}`}
                  label={t(`statuses.${tot.status}`)}
                  value={formatMoney(tot.amount, tot.currency, locale)}
                  hint={`${tot.count}`}
                />
              ))}
            </div>
          )}
          <Card>
            {data.total === 0 ? (
              <p className="text-sm text-ink-muted">{t("commissionsEmpty")}</p>
            ) : (
              <>
                <SimpleTable
                  head={[
                    t("col.reported"),
                    t("col.provider"),
                    t("col.reference"),
                    t("col.status"),
                    t("col.amount"),
                    t("col.source"),
                  ]}
                  rows={data.items.map((c) => [
                    time(c.reported_at),
                    c.provider_code,
                    c.external_reference,
                    t(`statuses.${c.status}`),
                    formatMoney(c.amount, c.currency, locale),
                    c.source,
                  ])}
                />
                <Pager page={page} total={data.total} onChange={setPage} />
              </>
            )}
          </Card>
        </div>
      )}
    </StateGuard>
  );
}
