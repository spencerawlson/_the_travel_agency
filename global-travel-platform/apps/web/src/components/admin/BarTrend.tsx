"use client";

import { useLocale } from "next-intl";
import { useId, useState } from "react";
import { intlLocale } from "@/lib/format";

interface Point {
  date: string;
  value: number;
}

const W = 600;
const H = 160;
const PAD_TOP = 18;
const PAD_BOTTOM = 22;
const GAP = 2;

/** Single-series daily bar chart: thin bars, rounded data ends anchored to the
 * baseline, recessive axis, per-bar hover/focus tooltip, and a table fallback. */
export function BarTrend({
  title,
  points,
  tableLabel,
}: {
  title: string;
  points: Point[];
  tableLabel: string;
}) {
  const locale = useLocale();
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...points.map((p) => p.value));
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const slot = W / Math.max(1, points.length);
  const barW = Math.max(1, slot - GAP);
  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat(intlLocale(locale), {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${iso}T00:00:00Z`));
  const peak = points.reduce((best, p, i) => (p.value > (points[best]?.value ?? -1) ? i : best), 0);
  const active = hover !== null ? points[hover] : undefined;

  return (
    <figure className="space-y-2">
      <figcaption id={`${id}-title`} className="text-sm font-semibold">
        {title}
      </figcaption>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-40 w-full"
          role="img"
          aria-labelledby={`${id}-title`}
          preserveAspectRatio="none"
          onMouseLeave={() => setHover(null)}
        >
          <line
            x1={0}
            x2={W}
            y1={H - PAD_BOTTOM}
            y2={H - PAD_BOTTOM}
            className="stroke-line"
            strokeWidth={1}
          />
          {points.map((p, i) => {
            const h = (p.value / max) * plotH;
            const x = i * slot + GAP / 2;
            const y = H - PAD_BOTTOM - h;
            const r = Math.min(4, barW / 2, h);
            return (
              <g key={p.date}>
                {h > 0 && (
                  <path
                    d={`M${x},${H - PAD_BOTTOM} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${H - PAD_BOTTOM} Z`}
                    className="fill-chart-1"
                    opacity={hover === null || hover === i ? 1 : 0.45}
                  />
                )}
                {/* Hit target taller and wider than the mark. */}
                <rect
                  x={i * slot}
                  y={0}
                  width={slot}
                  height={H}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                />
              </g>
            );
          })}
          {points.length > 0 && (points[peak]?.value ?? 0) > 0 && (
            <text
              x={Math.min(W - 20, peak * slot + slot / 2)}
              y={H - PAD_BOTTOM - ((points[peak]?.value ?? 0) / max) * plotH - 5}
              textAnchor="middle"
              className="fill-ink-muted text-[11px]"
            >
              {points[peak]?.value}
            </text>
          )}
          {points.length > 0 && (
            <>
              <text x={0} y={H - 6} className="fill-ink-muted text-[11px]">
                {fmtDate(points[0]!.date)}
              </text>
              <text x={W} y={H - 6} textAnchor="end" className="fill-ink-muted text-[11px]">
                {fmtDate(points[points.length - 1]!.date)}
              </text>
            </>
          )}
        </svg>
        {active && hover !== null && (
          <div
            role="status"
            className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-lg border border-line bg-surface-1 px-2.5 py-1.5 text-xs shadow-lg"
            style={{ left: `${((hover + 0.5) / points.length) * 100}%` }}
          >
            <p className="text-ink-muted">{fmtDate(active.date)}</p>
            <p className="font-semibold tabular-nums">{active.value}</p>
          </div>
        )}
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer text-ink-muted">{tableLabel}</summary>
        <table className="mt-2 w-full text-left tabular-nums">
          <tbody>
            {points.map((p) => (
              <tr key={p.date} className="border-t border-line">
                <td className="py-1">{p.date}</td>
                <td className="py-1 text-right">{p.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
