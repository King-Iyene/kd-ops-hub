// The body template of an API connection: which {{variables}} exist, sample values, and a preview of what the other tool would receive.
// The real substitution happens on the server; this only shows a person what a template will look like.
import type { ContentType } from './connectionPresets';

export const TEMPLATE_VARIABLES: { name: string; help: string }[] = [
  { name: 'title', help: 'The short headline, for example "Cara Obi has not tracked time today".' },
  { name: 'text', help: 'The full message text.' },
  { name: 'event', help: 'flag, summary, message or test.' },
  { name: 'severity', help: 'low, medium, high or critical (for items).' },
  { name: 'rule', help: 'The rule code, for example TR01.' },
  { name: 'person', help: 'The name of the person the item is about, when there is one.' },
  { name: 'sent_at', help: 'When it was sent, as an ISO date and time.' },
];

export const SAMPLE_VALUES: Record<string, string> = {
  title: 'Cara Obi has not tracked time today',
  text: 'No time has been tracked since 9:00 AM. Please start your timer.',
  event: 'flag',
  severity: 'high',
  rule: 'TR01',
  person: 'Cara Obi',
  sent_at: '2026-11-19T14:30:00Z',
};

const escapeFor = (value: string, type: ContentType): string => {
  if (type === 'json') return JSON.stringify(value).slice(1, -1);
  if (type === 'form') return encodeURIComponent(value);
  return value;
};

/** The template with every known {{variable}} replaced by a sample value, escaped for the content type. Unknown names are left as written. */
export function renderTemplate(template: string, type: ContentType, values: Record<string, string> = SAMPLE_VALUES): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (whole, name: string) => (name in values ? escapeFor(values[name], type) : whole));
}

/** {{names}} in the template that the agent does not fill in. */
export function unknownVariables(template: string): string[] {
  const known = new Set(TEMPLATE_VARIABLES.map((v) => v.name));
  const out = new Set<string>();
  for (const m of template.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)) if (!known.has(m[1])) out.add(m[1]);
  return [...out];
}

/** Whether the previewed body parses as JSON (only meaningful for the json content type). */
export function isValidJson(text: string): boolean {
  try { JSON.parse(text); return true; } catch { return false; }
}

/** Header names the server accepts: letters, digits and hyphens. */
export const validHeaderName = (n: string) => /^[A-Za-z0-9-]+$/.test(n);
export const MAX_EXTRA_HEADERS = 10;
