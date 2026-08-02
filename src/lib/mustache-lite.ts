/**
 * Minimal Mustache-style renderer — {{var}} substitution only.
 * No sections, no partials, no HTML escaping (templates are HTML source).
 * Missing vars render as empty string (never "undefined").
 */
export function renderTemplate(
  template: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, key: string) => {
    const v = vars[key];
    return v === null || v === undefined ? '' : String(v);
  });
}
