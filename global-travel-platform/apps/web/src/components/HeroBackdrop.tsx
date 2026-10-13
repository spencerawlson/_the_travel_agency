"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Link } from "@/i18n/navigation";

export interface BackdropSlide {
  slug: string;
  name: string;
  src: string;
  srcSmall: string;
  alt: string;
  focus: string;
  credit: string;
}

const INTERVAL_MS = 7000;

function subscribeMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/**
 * Full-bleed, slowly cross-fading destination photos behind the hero.
 * Only the current and next slides are mounted (bandwidth). Auto-advance has a
 * pause control (WCAG 2.2.2) and is off for prefers-reduced-motion.
 */
export function HeroBackdrop({ slides }: { slides: BackdropSlide[] }) {
  const t = useTranslations("home");
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
  const running = !paused && !reduced && slides.length > 1;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % slides.length), INTERVAL_MS);
    return () => clearInterval(id);
  }, [running, slides.length]);

  if (slides.length === 0) return null;
  const current = slides[index]!;
  const next = (index + 1) % slides.length;

  return (
    <>
      <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden bg-surface-2">
        {slides.map((s, i) =>
          i === index || i === next ? (
            // eslint-disable-next-line @next/next/no-img-element -- pre-optimised static WebP
            <img
              key={s.slug}
              src={s.src}
              srcSet={`${s.srcSmall} 800w, ${s.src} 1600w`}
              sizes="100vw"
              alt=""
              decoding="async"
              fetchPriority={i === 0 ? "high" : "low"}
              style={{ objectPosition: s.focus }}
              className={`hero-slide absolute inset-0 size-full object-cover transition-opacity duration-[1500ms] ${
                i === index ? "is-active opacity-100" : "opacity-0"
              }`}
            />
          ) : null,
        )}
        {/* Bright veil: even on phones (text covers the photo), strong on the text side from md up. */}
        <div className="absolute inset-0 bg-white/80 md:bg-transparent md:bg-gradient-to-r md:from-white/90 md:via-white/70 md:to-white/15" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-canvas to-transparent" />
      </div>

      <div className="absolute right-3 bottom-3 z-10 flex items-center gap-2 sm:right-6 sm:bottom-5">
        <Link
          href={`/destinations/${current.slug}`}
          className="rounded-full bg-black/45 px-3 py-1 text-xs font-medium text-white backdrop-blur hover:bg-black/60"
          aria-label={t("slideLink", { name: current.name })}
        >
          {current.name} · {current.credit}
        </Link>
        {slides.length > 1 && !reduced && (
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-pressed={paused}
            aria-label={paused ? t("playSlides") : t("pauseSlides")}
            className="flex size-7 items-center justify-center rounded-full bg-black/45 text-xs text-white backdrop-blur hover:bg-black/60"
          >
            <span aria-hidden>{paused ? "▶" : "❚❚"}</span>
          </button>
        )}
      </div>
    </>
  );
}
