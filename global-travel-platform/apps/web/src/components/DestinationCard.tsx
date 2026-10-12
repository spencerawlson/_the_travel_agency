import type { Destination } from "@gtp/shared-types";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { formatDuration } from "@/lib/format";
import { getPhoto } from "@/lib/photos";
import { Photo } from "./Photo";

export function DestinationCard({
  destination: d,
  originCity,
  priority = false,
}: {
  destination: Destination;
  originCity: string;
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
      <div className="absolute inset-x-0 bottom-0 p-5 text-white">
        <p className="font-display text-3xl font-semibold drop-shadow-sm">{d.name}</p>
        {d.approx_flight_minutes != null && (
          <p className="mt-1 text-sm font-medium text-white/85">
            ✈{" "}
            {t("flightChip", {
              time: formatDuration(d.approx_flight_minutes),
              city: originCity,
            })}
          </p>
        )}
      </div>
    </Link>
  );
}
