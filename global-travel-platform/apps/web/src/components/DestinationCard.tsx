import type { Destination } from "@gtp/shared-types";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { formatDuration } from "@/lib/format";
import { getPhoto } from "@/lib/photos";
import { Photo } from "./Photo";

export function DestinationCard({
  destination: d,
  priority = false,
}: {
  destination: Destination;
  priority?: boolean;
}) {
  const t = useTranslations("destinations");
  const locale = useLocale();
  return (
    <Link
      href={`/destinations/${d.slug}`}
      className="photo-zoom group relative block aspect-[4/5] overflow-hidden rounded-3xl bg-surface-2 shadow-sm ring-1 ring-line/60 transition hover:-translate-y-1 hover:shadow-xl sm:aspect-[4/5]"
    >
      <Photo
        photo={getPhoto(d.slug)}
        locale={locale}
        fallbackClass={`theme-${d.theme}`}
        sizes="(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw"
        priority={priority}
      />
      {/* Light scrim only at the bottom, so photos stay bright. */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/65 via-black/25 to-transparent"
      />
      {d.approx_flight_minutes != null && (
        <span className="absolute top-3 left-3 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-ink shadow-sm backdrop-blur">
          ✈ {t("flightChip", { time: formatDuration(d.approx_flight_minutes) })}
        </span>
      )}
      <div className="absolute inset-x-0 bottom-0 p-5 text-white">
        <p className="font-display text-3xl font-semibold drop-shadow-sm">{d.name}</p>
        <p className="mt-1 line-clamp-2 text-sm text-white/90">{d.summary}</p>
      </div>
    </Link>
  );
}
