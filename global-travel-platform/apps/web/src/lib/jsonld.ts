/** Serialise JSON-LD for an inline <script>. Escapes "<" so data can never
 * close the script tag early (e.g. a stray "</script>" in content). */
export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
