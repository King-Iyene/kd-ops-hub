// Wakes the executives: collects every waiting request in crew_wake_queue and starts the CFO's routine ONCE with the whole list, so a burst of events
// costs one session. The CFO runs each task as the named executive and writes one briefing.
//
// Deploy: supabase functions deploy crew-wake --no-verify-jwt   (the caller proves itself with the shared cron secret)
// Secrets: CRON_SHARED_SECRET (already set), CREW_RUNNER_ID (the CFO routine's id, trig_...), CREW_RUNNER_TOKEN (its API token; shown once on claude.ai).
//
// Called every minute by pg_cron (crew_wake_tick) only when something is waiting. Without the runner secrets it does nothing and leaves requests waiting,
// so it is safe to deploy first. At most 8 tasks per start; a rate-limited or failing call is tried again on the next ticks, up to 4 times.

import { serviceClient } from '../_shared/agent-claude.ts';
import { FIRE_BETA, FIRE_VERSION, batchText, classifyFire, fireUrl } from '../_shared/crew-wake-core.ts';

function equal(a: string | null, b: string | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!equal(req.headers.get('x-cron-secret'), Deno.env.get('CRON_SHARED_SECRET'))) return json({ error: 'unauthorized' }, 401);
  const runnerId = Deno.env.get('CREW_RUNNER_ID');
  const token = Deno.env.get('CREW_RUNNER_TOKEN');
  if (!runnerId || !token) return json({ ok: true, fired: 0, note: 'runner not configured yet' });

  const db = serviceClient();
  const { data: rows } = await db.from('crew_wake_queue').select('id, agent_id, reason, depth, source, attempts').eq('status', 'pending').lt('attempts', 4).order('created_at', { ascending: true }).limit(8);
  const list = (rows ?? []) as { id: string; agent_id: string; reason: string; depth: number; source: string; attempts: number }[];
  if (list.length === 0) return json({ ok: true, fired: 0 });

  // take them before sending, so two overlapping ticks never start the same tasks twice
  const mine: typeof list = [];
  for (const row of list) {
    const { data: claimed } = await db.from('crew_wake_queue').update({ attempts: row.attempts + 1 }).eq('id', row.id).eq('status', 'pending').eq('attempts', row.attempts).select('id');
    if (claimed && claimed.length > 0) mine.push(row);
  }
  if (mine.length === 0) return json({ ok: true, fired: 0 });

  const tasks: { id: string; slug: string; reason: string; depth: number; source: string }[] = [];
  for (const row of mine) {
    const { data: agent } = await db.from('crew_agents').select('slug, active').eq('id', row.agent_id).maybeSingle();
    if (!agent || !agent.active) { await db.from('crew_wake_queue').update({ status: 'skipped', error: 'that person has left the team' }).eq('id', row.id); continue; }
    tasks.push({ id: row.id, slug: agent.slug as string, reason: row.reason, depth: row.depth, source: row.source });
  }
  if (tasks.length === 0) return json({ ok: true, fired: 0 });

  const ids = tasks.map((x) => x.id);
  try {
    const res = await fetch(fireUrl(runnerId), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'anthropic-beta': FIRE_BETA, 'anthropic-version': FIRE_VERSION, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: batchText(tasks) }),
    });
    const body = await res.json().catch(() => null);
    const o = classifyFire(res.status, body);
    if (o.kind === 'fired') { await db.from('crew_wake_queue').update({ status: 'fired', fired_at: new Date().toISOString(), session_url: o.sessionUrl }).in('id', ids); return json({ ok: true, fired: ids.length }); }
    if (o.kind === 'failed') { await db.from('crew_wake_queue').update({ status: 'failed', error: o.why }).in('id', ids); return json({ ok: true, failed: ids.length }); }
    await db.from('crew_wake_queue').update({ error: o.why }).in('id', ids);
    return json({ ok: true, retry: ids.length });
  } catch (e) {
    await db.from('crew_wake_queue').update({ error: String((e as Error).message ?? e).slice(0, 300) }).in('id', ids);
    return json({ ok: true, retry: ids.length });
  }
});
