function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Minimal Mustache-style renderer — {{var}} substitution only.
 * No sections, no partials. Missing vars render as empty string.
 * All substituted values are HTML-escaped to prevent XSS.
 */
export function renderTemplate(
  template: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return template
    .replace(/\{\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}\}/g, (_, key: string) => {
      const v = vars[key];
      return v === null || v === undefined ? '' : escapeHtml(String(v));
    })
    .replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, key: string) => {
      const v = vars[key];
      return v === null || v === undefined ? '' : escapeHtml(String(v));
    });
}
