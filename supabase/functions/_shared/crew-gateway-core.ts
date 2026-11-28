// Crew gateway: the ONE door the AI agents (CFO, accountant, CTO ...) use. Pure parts, no Deno APIs, so they can be unit tested.
//
// An agent proves itself with its own token (Authorization: Bearer crew_...). It can only ask for the operations listed in OPS.
// Every operation is one database function that checks the agent's permissions itself (see the crew_agents_foundation migration),
// so a bug or a clever prompt in here still cannot widen what an agent may do. There is NO operation that writes a finance record,
// deletes anything, pays anyone or touches GitHub/Vercel/Supabase: the agent can only put a proposal in the queue.

export type Json = Record<string, unknown>;

export class GatewayError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export interface RpcPlan { fn: string; args: Json }
/** Operations answered by a plain read of the agent's own rows instead of a function. */
export type ReadPlan = { read: 'whoami' | 'team' | 'proposals'; status?: string; limit?: number };
export type Plan = RpcPlan | ReadPlan;

export const OPS = [
  'whoami', 'team', 'tables', 'read', 'propose', 'withdraw', 'proposals', 'inbox', 'message', 'note', 'retire_note', 'save_summary',
  'signals', 'heartbeat', 'begin_run', 'log_run', 'respond_order', 'endorse', 'my_approved', 'report_done', 'knowledge', 'ideas', 'idea', 'idea_support', 'idea_triage', 'sources', 'app', 'mistake', 'mistakes',
] as const;
export type Op = (typeof OPS)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

function uuid(a: Json, k: string, required = true): string | null {
  const v = a[k];
  if (v === undefined || v === null || v === '') { if (required) throw new GatewayError(`${k} is required`); return null; }
  if (typeof v !== 'string' || !UUID.test(v)) throw new GatewayError(`${k} must be an id`);
  return v.toLowerCase();
}
function text(a: Json, k: string, max: number, required = true): string | null {
  const v = a[k];
  if (v === undefined || v === null) { if (required) throw new GatewayError(`${k} is required`); return null; }
  if (typeof v !== 'string') throw new GatewayError(`${k} must be text`);
  if (required && v.trim() === '') throw new GatewayError(`${k} is required`);
  if (v.length > max) throw new GatewayError(`${k} is too long (max ${max} characters)`);
  return v;
}
function oneOf<T extends string>(a: Json, k: string, allowed: readonly T[], dflt?: T): T {
  const v = a[k] ?? dflt;
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) throw new GatewayError(`${k} must be one of: ${allowed.join(', ')}`);
  return v as T;
}
function obj(a: Json, k: string, maxBytes = 60_000): Json {
  const v = a[k];
  if (v === undefined || v === null) return {};
  if (!isObj(v)) throw new GatewayError(`${k} must be an object`);
  if (JSON.stringify(v).length > maxBytes) throw new GatewayError(`${k} is too big`);
  return v;
}
function int(a: Json, k: string, min: number, max: number, dflt: number): number {
  const v = a[k];
  if (v === undefined || v === null) return dflt;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new GatewayError(`${k} must be a number`);
  return Math.max(min, Math.min(max, Math.trunc(v)));
}

export const ACTION_RE = /^(record\.(create|update|soft_delete)|draft\.(batch_payment|payroll_run|invoice|filing)|advice\.[a-z_]+|agent\.(retire|hire)|external\.(github|vercel|supabase|other))$/;
const STATUSES = ['offline', 'idle', 'working', 'thinking', 'waiting_approval', 'walking', 'meeting'] as const;
const NOTE_KINDS = ['lesson', 'rule', 'fact', 'preference', 'mistake'] as const;
const NOTE_SOURCES = ['proposal_outcome', 'owner_feedback', 'self_review', 'order_veto', 'ci_result', 'other'] as const;
const MSG_KINDS = ['message', 'reply', 'report', 'alert', 'challenge', 'reminder', 'brief'] as const;
const MISTAKE_KINDS = ['wrong_proposal', 'duplicate', 'wrong_numbers', 'missed_deadline', 'ignored_order', 'other'] as const;
const IDEA_STATUSES = ['open', 'triaged', 'approved', 'building', 'shipped', 'rejected', 'merged'] as const;
const FILTER_OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'is_null', 'not_null'] as const;

/** A short list of column names (letters, digits and underscores only), or null when not given. */
function names(a: Json, k: string): string[] | null {
  const v = a[k];
  if (v === undefined || v === null) return null;
  if (!Array.isArray(v) || v.length === 0 || v.length > 60 || !v.every((x) => typeof x === 'string' && /^[a-z][a-z0-9_]{0,60}$/.test(x))) throw new GatewayError(`${k} must be a list of column names`);
  return v as string[];
}

function filters(a: Json): Json[] {
  const v = a.filters;
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > 12) throw new GatewayError('filters must be a list of at most 12');
  return v.map((f) => {
    if (!isObj(f) || typeof f.field !== 'string' || f.field.length > 120) throw new GatewayError('each filter needs a field name');
    const op = oneOf(f, 'op', FILTER_OPS);
    const value = f.value === undefined || f.value === null ? null : String(f.value).slice(0, 300);
    return { field: f.field, op, value };
  });
}

/**
 * Turns one request into the single database call that answers it. `lookup` turns an agent's slug ("cfo") into its id.
 * Anything not listed in OPS is refused.
 */
export async function plan(op: unknown, a: Json, agentId: string, lookup: (slug: string) => Promise<string | null>): Promise<Plan> {
  switch (op) {
    case 'whoami': return { read: 'whoami' };
    case 'team': return { read: 'team' };
    case 'proposals': return { read: 'proposals', status: a.status === undefined ? undefined : oneOf(a, 'status', ['pending', 'approved', 'rejected', 'executed', 'failed', 'expired', 'withdrawn'] as const), limit: int(a, 'limit', 1, 100, 30) };
    case 'tables': return { fn: 'crew_list_tables', args: { p_agent: agentId, p_search: text(a, 'search', 80, false), p_table: uuid(a, 'table_id', false) } };
    case 'sources': return { fn: 'crew_list_sources', args: { p_agent: agentId } };
    case 'app': return {
      fn: 'crew_read_app',
      args: {
        p_agent: agentId, p_source: text(a, 'source', 40), p_filters: filters(a), p_limit: int(a, 'limit', 1, 500, 100), p_order_field: text(a, 'order_field', 80, false), p_desc: a.desc === false ? false : true, p_select: names(a, 'select'),
      },
    };
    case 'read': return {
      fn: 'crew_read_records',
      args: { p_agent: agentId, p_table: uuid(a, 'table_id'), p_filters: filters(a), p_limit: int(a, 'limit', 1, 500, 100), p_order_field: text(a, 'order_field', 120, false), p_desc: a.desc === false ? false : true },
    };
    case 'propose': {
      const action = a.action;
      if (typeof action !== 'string' || !ACTION_RE.test(action)) throw new GatewayError('unknown action');
      return {
        fn: 'crew_propose',
        args: {
          p_agent: agentId, p_action: action, p_table: uuid(a, 'table_id', false),
          p_summary: text(a, 'summary', 400), p_rationale: text(a, 'rationale', 4000, false) ?? '', p_payload: obj(a, 'payload'),
          p_evidence: obj(a, 'evidence'), p_risk: oneOf(a, 'risk', ['low', 'medium', 'high'] as const, 'medium'),
          p_dedupe: text(a, 'dedupe_key', 200, false), p_ledger_key: text(a, 'ledger_key', 300, false), p_order: uuid(a, 'order_id', false),
        },
      };
    }
    case 'withdraw': return { fn: 'crew_withdraw', args: { p_agent: agentId, p_proposal: uuid(a, 'proposal_id') } };
    case 'inbox': return { fn: 'crew_inbox', args: { p_agent: agentId, p_limit: int(a, 'limit', 1, 200, 50) } };
    case 'message': {
      const to = a.to;
      let toId: string | null = null;
      if (to !== undefined && to !== null && to !== 'owner') {
        if (typeof to !== 'string' || !/^[a-z][a-z0-9_]{1,30}$/.test(to)) throw new GatewayError('to must be "owner" or an agent slug');
        toId = await lookup(to);
        if (!toId) throw new GatewayError(`no agent called ${to}`);
        if (toId === agentId) throw new GatewayError('you cannot message yourself');
      }
      return {
        fn: 'crew_post_message',
        args: { p_agent: agentId, p_to_agent: toId, p_body: text(a, 'body', 8000), p_kind: oneOf(a, 'kind', MSG_KINDS, 'message'), p_ref_proposal: uuid(a, 'ref_proposal', false), p_ref_order: uuid(a, 'ref_order', false) },
      };
    }
    case 'note': return {
      fn: 'crew_add_note',
      args: { p_agent: agentId, p_kind: oneOf(a, 'kind', NOTE_KINDS, 'lesson'), p_body: text(a, 'body', 2000), p_source: oneOf(a, 'source', NOTE_SOURCES, 'self_review'), p_evidence: obj(a, 'evidence', 8000), p_confidence: int(a, 'confidence', 1, 5, 3) },
    };
    case 'retire_note': return { fn: 'crew_retire_my_note', args: { p_agent: agentId, p_note: uuid(a, 'note_id') } };
    case 'save_summary': return { fn: 'crew_save_summary', args: { p_agent: agentId, p_notes: text(a, 'notes', 30000) } };
    case 'signals': return { fn: 'crew_signals', args: { p_agent: agentId } };
    case 'heartbeat': {
      const num = (k: string) => (a[k] === undefined || a[k] === null ? null : (typeof a[k] === 'number' && Number.isFinite(a[k]) ? (a[k] as number) : (() => { throw new GatewayError(`${k} must be a number`); })()));
      return { fn: 'crew_heartbeat', args: { p_agent: agentId, p_status: oneOf(a, 'status', STATUSES), p_activity: text(a, 'activity', 200, false) ?? '', p_x: num('x'), p_y: num('y') } };
    }
    case 'begin_run': return { fn: 'crew_begin_run', args: { p_agent: agentId, p_kind: oneOf(a, 'kind', ['routine', 'chat', 'review', 'other'] as const, 'routine') } };
    case 'knowledge': return { fn: 'crew_get_knowledge', args: { p_agent: agentId, p_topic: text(a, 'topic', 120, false) } };
    case 'log_run': return {
      fn: 'crew_log_run',
      args: { p_agent: agentId, p_kind: oneOf(a, 'kind', ['routine', 'chat', 'review', 'other'] as const, 'routine'), p_ok: a.ok === false ? false : true, p_summary: text(a, 'summary', 4000, false) ?? '', p_stats: obj(a, 'stats', 8000) },
    };
    case 'respond_order': return {
      fn: 'crew_respond_order',
      args: { p_agent: agentId, p_order: uuid(a, 'order_id'), p_stance: oneOf(a, 'stance', ['accept', 'challenge', 'done'] as const), p_text: text(a, 'text', 4000, a.stance === 'challenge'), p_evidence: obj(a, 'evidence', 8000) },
    };
    case 'endorse': return {
      fn: 'crew_endorse',
      args: { p_agent: agentId, p_proposal: uuid(a, 'proposal_id'), p_stance: oneOf(a, 'stance', ['support', 'oppose'] as const), p_note: text(a, 'note', 1000, false) ?? '' },
    };
    case 'ideas': return { fn: 'crew_idea_list', args: { p_agent: agentId, p_status: a.status === undefined || a.status === null ? null : oneOf(a, 'status', IDEA_STATUSES) } };
    case 'idea': return {
      fn: 'crew_idea_submit',
      args: { p_agent: agentId, p_title: text(a, 'title', 160), p_problem: text(a, 'problem', 2000), p_proposal: text(a, 'proposal', 2000, false) ?? '', p_evidence: obj(a, 'evidence', 8000) },
    };
    case 'idea_support': return { fn: 'crew_idea_support', args: { p_agent: agentId, p_idea: uuid(a, 'idea_id'), p_note: text(a, 'note', 400, false) ?? '' } };
    case 'idea_triage': return {
      fn: 'crew_idea_triage',
      args: {
        p_agent: agentId, p_idea: uuid(a, 'idea_id'), p_priority: a.priority === undefined || a.priority === null ? null : oneOf(a, 'priority', ['low', 'medium', 'high'] as const),
        p_spec: text(a, 'spec', 8000, false), p_estimate: text(a, 'estimate', 300, false), p_merge_into: uuid(a, 'merge_into', false),
      },
    };
    case 'mistake': {
      const who = a.agent;
      if (typeof who !== 'string' || !/^[a-z][a-z0-9_]{1,30}$/.test(who)) throw new GatewayError('agent must be the slug of someone who reports to you');
      const targetId = await lookup(who);
      if (!targetId) throw new GatewayError('no agent called ' + who);
      return { fn: 'crew_report_mistake', args: { p_agent: agentId, p_target: targetId, p_kind: oneOf(a, 'kind', MISTAKE_KINDS, 'other'), p_note: text(a, 'note', 1000), p_proposal: uuid(a, 'proposal_id', false) } };
    }
    case 'mistakes': return { fn: 'crew_team_mistakes', args: { p_agent: agentId } };
    case 'my_approved': return { fn: 'crew_my_approved', args: { p_agent: agentId } };
    case 'report_done': return { fn: 'crew_report_done', args: { p_agent: agentId, p_proposal: uuid(a, 'proposal_id'), p_result: obj(a, 'result', 8000) } };
    default: throw new GatewayError(`unknown operation (use one of: ${OPS.join(', ')})`, 404);
  }
}

/** A short, safe message for the agent: our own "raise exception" texts are for it to read; anything else is hidden. */
export function describeDbError(err: { code?: string; message?: string }): { status: number; message: string } {
  if (err.code === 'P0001') return { status: 400, message: err.message ?? 'refused' };
  if (err.code === '23505') return { status: 409, message: err.message && err.message.startsWith('duplicate: ') ? err.message : 'duplicate: that was already recorded' };
  if (err.code === '22P02' || err.code === '22007' || err.code === '22003') return { status: 400, message: 'a value has the wrong format' };
  return { status: 500, message: 'the database could not do that (it was logged)' };
}

/** At most `limit` requests per agent per minute, counted in memory by the running function. */
export function makeLimiter(limit: number, now: () => number = Date.now) {
  const hits = new Map<string, number[]>();
  return (key: string): boolean => {
    const t = now();
    const recent = (hits.get(key) ?? []).filter((x) => t - x < 60_000);
    if (recent.length >= limit) { hits.set(key, recent); return false; }
    recent.push(t);
    hits.set(key, recent);
    return true;
  };
}

export function bearer(header: string | null): string | null {
  const m = /^Bearer (crew_[0-9a-f]{48})$/.exec(header ?? '');
  return m ? m[1] : null;
}
