import type { Destination } from "@gtp/shared-types";
import { Link } from "@/i18n/navigation";

export function DestinationCard({ destination: d }: { destination: Destination }) {
  return (
    <Link
      href={`/destinations/${d.slug}`}
      className="group block overflow-hidden rounded-2xl border border-line bg-surface-1 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className={`theme-${d.theme} relative flex h-40 items-end p-4`}>
        <span className="font-display text-3xl font-semibold text-white drop-shadow">{d.name}</span>
        <span className="absolute top-3 right-3 rounded-md bg-black/30 px-2 py-0.5 font-mono text-xs text-white">
          {d.airport_iata}
        </span>
      </div>
      <p className="p-4 text-sm text-ink-muted">{d.summary}</p>
    </Link>
  );
}
