/**
 * Cloudflare edge headers. Cloudflare terminates TLS at the edge, so the origin
 * only ever sees plain HTTP (Nginx overwrites X-Forwarded-Proto with $scheme).
 * Cloudflare sends the real visitor scheme in the CF-Visitor header, which
 * Nginx passes through untouched.
 */

/**
 * Real visitor scheme from Cloudflare's CF-Visitor header (`{"scheme":"https"}`).
 * Returns null when the header is absent or malformed, so callers leave the
 * request untouched (local dev has no Cloudflare in front of it).
 */
export function cloudflareScheme(cfVisitor: string | null): "https" | "http" | null {
  if (!cfVisitor) return null;
  try {
    const scheme = (JSON.parse(cfVisitor) as { scheme?: unknown }).scheme;
    return scheme === "https" || scheme === "http" ? scheme : null;
  } catch {
    return null;
  }
}
