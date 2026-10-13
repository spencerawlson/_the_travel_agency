/**
 * Lets other parts of the destinations page (the search box) ask the globe to
 * fly the little plane to a destination. Returns false when no globe took the
 * request (no WebGL, reduced motion, or the destination isn't on the globe),
 * so the caller should just navigate.
 */
export const FLY_EVENT = "farelune:fly-to";

export interface FlyRequest {
  slug: string;
  handled: boolean;
}

export function requestFlight(slug: string): boolean {
  const detail: FlyRequest = { slug, handled: false };
  window.dispatchEvent(new CustomEvent<FlyRequest>(FLY_EVENT, { detail }));
  return detail.handled;
}
