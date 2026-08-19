// Guards against a stored javascript:/data: URI ending up in an <a href>.
// Same allow-list MarkdownRenderer.tsx already uses for markdown links —
// this is the equivalent for React components that render a raw
// user-supplied URL string directly (contractor/contact/client links),
// which had no scheme check at all.
const ALLOWED_PROTOCOLS = ['http://', 'https://', 'mailto:'];

/** Returns the href unchanged if it starts with an allowed protocol, else null. */
export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  const lower = trimmed.toLowerCase();
  return ALLOWED_PROTOCOLS.some((p) => lower.startsWith(p)) ? trimmed : null;
}
