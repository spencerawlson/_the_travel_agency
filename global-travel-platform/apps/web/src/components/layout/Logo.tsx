/**
 * Animated wordmark: a small airplane flies left → right across the name on page
 * load, drawing a dashed contrail, then parks after the wordmark. Hovering the logo
 * replays the flight. Respects prefers-reduced-motion (the plane simply rests at the end).
 *
 * Airplane glyph: Material Symbols "flight" (Apache License 2.0), rotated to face right.
 */
export function Logo({ name }: { name: string }) {
  return (
    <span className="logo group relative inline-flex items-center pr-9 pb-1.5">
      <span className="font-display text-xl font-semibold tracking-tight sm:text-2xl">{name}</span>
      {/* Contrail */}
      <span
        aria-hidden
        className="logo-trail pointer-events-none absolute bottom-0.5 left-0 h-px w-[calc(100%-1.75rem)] origin-left"
      />
      {/* Airplane */}
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="logo-plane pointer-events-none absolute bottom-[-0.35rem] size-6 text-accent-500"
      >
        <path
          fill="currentColor"
          transform="rotate(90 12 12)"
          d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"
        />
      </svg>
    </span>
  );
}
