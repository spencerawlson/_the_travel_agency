import { photoAlt, type PhotoCredit } from "@/lib/photos";

interface Props {
  photo: PhotoCredit | null;
  locale: string;
  /** Fallback gradient class (theme-*) when no photo exists. */
  fallbackClass?: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
}

/**
 * Pre-optimised WebP photo with a responsive srcset. Plain <img> on purpose:
 * images are already resized at build time by scripts/fetch_photos.py, so the
 * Next.js image optimiser (and its runtime dependencies) isn't needed.
 */
export function Photo({
  photo,
  locale,
  fallbackClass,
  sizes = "100vw",
  priority,
  className,
}: Props) {
  if (!photo) {
    return <div aria-hidden className={`absolute inset-0 ${fallbackClass ?? "theme-ocean"}`} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- pre-optimised static WebP
    <img
      src={photo.src}
      srcSet={`${photo.srcSmall} 800w, ${photo.src} 1600w`}
      sizes={sizes}
      alt={photoAlt(photo, locale)}
      width={photo.width}
      height={photo.height}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      style={{ objectPosition: photo.focus }}
      className={`absolute inset-0 size-full object-cover ${className ?? ""}`}
    />
  );
}

export function PhotoCaption({ photo }: { photo: PhotoCredit | null }) {
  if (!photo) return null;
  return (
    <a href={photo.source} target="_blank" rel="noopener noreferrer" className="hover:underline">
      © {photo.author} · {photo.license}
    </a>
  );
}
