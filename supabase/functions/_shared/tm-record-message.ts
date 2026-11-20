// Task tables, sending a new entry to another tool: loads the rule, the entry and the names it points to, and builds the message
// (see tm-record-message-core.ts). Used by the sender (agent-dispatch) and by "Send test" (agent-connections).
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import type { Outgoing } from './agent-deliver-core.ts';
import { mentionFor } from './agent-mention.ts';
import { buildEntryText, easternTime, findPersonId, type FieldDef, type Names } from './tm-record-message-core.ts';

export interface RecordRule { id: string; table_id: string; connection_id: string; name: string; template: string | null; channel: string | null; tag_person: boolean; cc_manager: boolean }
export type RecordMessage = { ok: true; msg: Outgoing; rule: RecordRule } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const asList = (raw: unknown): unknown[] => (Array.isArray(raw) ? raw : raw === null || raw === undefined || raw === '' ? [] : [raw]);

export async function buildRecordMessage(db: SupabaseClient, ruleId: string, recordId: string | null, appUrl: string, kind: string, test = false): Promise<RecordMessage> {
  const { data: rule } = await db.from('tm_table_connections').select('id, table_id, connection_id, name, template, channel, tag_person, cc_manager').eq('id', ruleId).maybeSingle();
  if (!rule) return { ok: false, error: 'That connection no longer exists.' };
  const r = rule as RecordRule;

  let rec: { id: string; data: Record<string, unknown>; created_at: string; created_by: string | null } | null;
  if (recordId) rec = (await db.from('tm_table_records').select('id, data, created_at, created_by').eq('id', recordId).maybeSingle()).data as typeof rec;
  else rec = (await db.from('tm_table_records').select('id, data, created_at, created_by').eq('table_id', r.table_id).order('created_at', { ascending: false }).limit(1).maybeSingle()).data as typeof rec;
  if (!rec) return { ok: false, error: recordId ? 'The entry no longer exists.' : 'This table has no entries yet to send as a test.' };

  const [{ data: table }, { data: fieldRows }] = await Promise.all([
    db.from('tm_tables').select('name').eq('id', r.table_id).maybeSingle(),
    db.from('tm_table_fields').select('id, name, type').eq('table_id', r.table_id).order('position', { ascending: true }),
  ]);
  const fields = (fieldRows ?? []) as FieldDef[];
  const data = (rec.data ?? {}) as Record<string, unknown>;

  // Names for the people and tasks the entry points to
  const personIds = new Set<string>(); const taskIds = new Set<string>();
  for (const f of fields) {
    const ids = asList(data[f.id]).map(String).filter((s) => UUID.test(s));
    if (f.type === 'person') ids.forEach((i) => personIds.add(i));
    if (f.type === 'task') ids.forEach((i) => taskIds.add(i));
  }
  const names: Names = { people: {}, tasks: {} };
  if (personIds.size) for (const p of (await db.from('profiles').select('id, full_name').in('id', [...personIds])).data ?? []) names.people[p.id as string] = (p.full_name as string) ?? '';
  if (taskIds.size) for (const t of (await db.from('tm_tasks').select('id, title').in('id', [...taskIds])).data ?? []) names.tasks[t.id as string] = (t.title as string) ?? '';

  const link = `${appUrl}/task/table/${r.table_id}`;
  const text = buildEntryText({ table: (table?.name as string) ?? 'the table', template: r.template, fields, data, names, link, submittedAt: easternTime(rec.created_at), test });

  // Who it is about: the first person in the entry, otherwise whoever submitted it. Their manager is tagged as a CC.
  let mention: Outgoing['mention'];
  let personName = '';
  const personId = findPersonId(fields, data) ?? rec.created_by;
  if (personId) {
    personName = names.people[personId] ?? ((await db.from('profiles').select('full_name').eq('id', personId).maybeSingle()).data?.full_name as string | undefined) ?? '';
    if (r.tag_person) {
      mention = await mentionFor(db, kind, personId);
      if (mention && r.cc_manager) {
        const managerId = (await db.from('profiles').select('reporting_manager_id').eq('id', personId).maybeSingle()).data?.reporting_manager_id as string | null | undefined;
        if (managerId && managerId !== personId) {
          const cc = await mentionFor(db, kind, managerId);
          if (cc) mention = { ...mention, cc: { name: cc.name, id: cc.id } };
        }
      }
    }
  }
  return {
    ok: true, rule: r,
    msg: { title: text.title, text: text.text, event: 'record', meta: { severity: 'info', rule: r.name, person: personName }, link: { url: link, label: 'Open the table' }, mention },
  };
}

/** A rule can send to a different Cliq channel than the connection's own (Cliq API connections only). */
export function effectiveConfig(config: Record<string, unknown>, kind: string, rule: Pick<RecordRule, 'channel'>): Record<string, unknown> {
  return rule.channel && kind === 'cliq' && config.mode === 'api' ? { ...config, channel: rule.channel } : config;
}
