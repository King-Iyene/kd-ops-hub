// Rules for writing a "link" field through the REST API, kept free of database and Deno code so they can be
// unit tested. A link field holds a list of records in another table. Following Airtable, a request sets the
// whole list: records named are linked, records linked before but not named are unlinked.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AIRTABLE_RE = /^rec[A-Za-z0-9]{14}$/;
const SHORT_RE = /^[0-9A-Za-z]{1,25}$/;

/** Most records one request may link in a single field. */
export const MAX_LINKS_PER_FIELD = 100;

export type RefKind = 'uuid' | 'airtable' | 'short' | 'invalid';

/** What kind of record reference this is: a UUID, an old Airtable id (recXXXXXXXXXXXXXX), a KDOps short id. */
export function classifyRef(ref: string): RefKind {
  if (UUID_RE.test(ref)) return 'uuid';
  if (AIRTABLE_RE.test(ref)) return 'airtable';
  if (SHORT_RE.test(ref)) return 'short';
  return 'invalid';
}

/**
 * The record references in a link field's value. Accepts a list of ids, a list of {id}, one id, or null/empty
 * (which means "no links"). Anything else is an error, never a guess.
 */
export function normalizeLinkInput(value: unknown): { refs: string[]; error?: string } {
  if (value === null || value === undefined || value === '') return { refs: [] };
  const list = Array.isArray(value) ? value : [value];
  const refs: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const ref = typeof item === 'string' ? item : item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string' ? (item as { id: string }).id : null;
    if (ref === null || ref.trim() === '') return { refs: [], error: 'Each linked record must be a record id (or an object with an "id")' };
    const clean = ref.trim();
    if (!seen.has(clean)) {
      seen.add(clean);
      refs.push(clean);
    }
  }
  if (refs.length > MAX_LINKS_PER_FIELD) return { refs: [], error: `At most ${MAX_LINKS_PER_FIELD} linked records per field` };
  return { refs };
}

/** What has to change to turn the existing list into the wanted one. */
export function planLinkChange(existing: readonly string[], desired: readonly string[]): { toAdd: string[]; toRemove: string[] } {
  const have = new Set(existing);
  const want = new Set(desired);
  return {
    toAdd: [...want].filter((id) => !have.has(id)),
    toRemove: [...have].filter((id) => !want.has(id)),
  };
}
