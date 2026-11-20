// Task tables, sending a new entry to another tool: how an entry reads as a message. Pure, no Deno APIs, so it can be unit tested.
//
// An entry is { field id: value }. A person field holds a profile id (or a list of them), a task field a task id (or a list). The names
// those ids stand for are looked up by the caller and passed in `names`, so this file never touches the database.

export interface FieldDef { id: string; name: string; type: string }
export interface Names { people: Record<string, string>; tasks: Record<string, string> }

/** Types that are filled in by the system, not by the person: left out of the "send every answer" list. */
export const SYSTEM_FIELD_TYPES = ['created_by', 'created_at', 'last_modified', 'auto_number', 'attachment'];

const VALUE_MAX = 700;
const MESSAGE_MAX = 3000;
const EASTERN = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' });

const asList = (raw: unknown): unknown[] => (Array.isArray(raw) ? raw : raw === null || raw === undefined || raw === '' ? [] : [raw]);

/** One answer as plain text. Empty when there is nothing there. */
export function valueText(field: FieldDef, raw: unknown, names: Names): string {
  let out: string;
  switch (field.type) {
    case 'person': out = asList(raw).map((id) => names.people[String(id)] ?? '').filter(Boolean).join(', '); break;
    case 'task': out = asList(raw).map((id) => names.tasks[String(id)] ?? '').filter(Boolean).join(', '); break;
    case 'checkbox': out = raw === true ? 'Yes' : raw === false ? 'No' : ''; break;
    case 'number': out = typeof raw === 'number' ? String(raw) : raw === null || raw === undefined ? '' : String(raw); break;
    default:
      out = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.map(String).join(', ') : raw === null || raw === undefined ? '' : typeof raw === 'object' ? '' : String(raw);
  }
  out = out.replace(/\r\n/g, '\n').trim();
  return out.length > VALUE_MAX ? `${out.slice(0, VALUE_MAX - 1)}…` : out;
}

/** The first person an entry is about: the first person field that has someone in it. */
export function findPersonId(fields: FieldDef[], data: Record<string, unknown>): string | null {
  for (const f of fields) {
    if (f.type !== 'person') continue;
    const first = asList(data[f.id]).map(String).find((s) => /^[0-9a-f-]{36}$/i.test(s));
    if (first) return first;
  }
  return null;
}

/** "Name: Cara" lines for every answered, person-filled field, in the table's order. */
export function formatEntry(fields: FieldDef[], data: Record<string, unknown>, names: Names): string {
  const lines: string[] = [];
  for (const f of fields) {
    if (SYSTEM_FIELD_TYPES.includes(f.type)) continue;
    const v = valueText(f, data[f.id], names);
    if (!v) continue;
    lines.push(v.includes('\n') ? `${f.name}:\n${v}` : `${f.name}: ${v}`);
  }
  return lines.join('\n');
}

export interface TemplateVars { table: string; link: string; submittedAt: string }

/** {{Field name}} (any field, case-insensitive), {{table}}, {{link}}, {{submitted_at}}. Anything unknown becomes empty. */
export function renderEntryTemplate(template: string, fields: FieldDef[], data: Record<string, unknown>, names: Names, vars: TemplateVars): string {
  const byName = new Map(fields.map((f) => [f.name.trim().toLowerCase(), f]));
  return template.replace(/\{\{\s*([^{}]{1,80}?)\s*\}\}/g, (_m, raw: string) => {
    const key = raw.trim().toLowerCase();
    if (key === 'table') return vars.table;
    if (key === 'link') return vars.link;
    if (key === 'submitted_at') return vars.submittedAt;
    const f = byName.get(key);
    return f ? valueText(f, data[f.id], names) : '';
  });
}

export function easternTime(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : new Date();
  return Number.isNaN(d.getTime()) ? '' : `${EASTERN.format(d)} ET`;
}

export interface EntryMessage { title: string; text: string }

/** The title and text to send. An empty or blank template means "send every answer". */
export function buildEntryText(opts: {
  table: string; template: string | null | undefined; fields: FieldDef[]; data: Record<string, unknown>; names: Names; link: string; submittedAt: string; test?: boolean;
}): EntryMessage {
  const vars: TemplateVars = { table: opts.table, link: opts.link, submittedAt: opts.submittedAt };
  const custom = typeof opts.template === 'string' && opts.template.trim() !== '';
  let text = custom ? renderEntryTemplate(opts.template as string, opts.fields, opts.data, opts.names, vars) : formatEntry(opts.fields, opts.data, opts.names);
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  if (!text) text = 'A new entry was added.';
  if (text.length > MESSAGE_MAX) text = `${text.slice(0, MESSAGE_MAX - 1)}…`;
  return { title: `${opts.test ? 'Test: ' : ''}New entry in ${opts.table}`.slice(0, 200), text };
}
