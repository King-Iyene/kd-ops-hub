// Ops Agent: sends what is waiting in the outbox to the connections that asked for it (new high-priority items, summaries ...).
//
// Deploy: supabase functions deploy agent-dispatch --no-verify-jwt   (the caller proves itself with the shared cron secret)
//
// Called by pg_cron every minute through agent_dispatch_tick() with the header X-Cron-Secret. Nobody else can run it: with no
// or a wrong secret it answers 401 and does nothing. Works through at most 20 messages a call, oldest first; a message that
// fails is tried again on the next calls, up to 4 times, then marked failed. A connection that was deleted takes its queue with it.

import { serviceClient } from '../_shared/agent-claude.ts';
import { deliver } from '../_shared/agent-deliver.ts';
import { type ConnectionKind } from '../_shared/agent-deliver-core.ts';
import { mentionFor } from '../_shared/agent-mention.ts';
import { accessSaver, readConnectionSecrets } from '../_shared/agent-conn-secrets.ts';
import { MAX_ATTEMPTS, formatFlag, formatSummary, type FlagRow, type SummaryRow } from '../_shared/agent-dispatch-core.ts';

function equal(a: string | null, b: string | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 });
  if (!equal(req.headers.get('x-cron-secret'), Deno.env.get('CRON_SHARED_SECRET'))) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const db = serviceClient();
  const out = { sent: 0, failed: 0, retried: 0 };
  const appUrl = ((await db.from('agent_settings').select('app_url').eq('id', true).maybeSingle()).data?.app_url as string | undefined) ?? 'https://ops.kdsquares.com';
  try {
    const { data: rows } = await db.from('agent_outbox').select('id, connection_id, kind, ref_id, attempts').eq('status', 'pending').lt('attempts', MAX_ATTEMPTS)
      .order('created_at', { ascending: true }).limit(20);
    for (const row of (rows ?? []) as { id: string; connection_id: string; kind: 'flag' | 'summary'; ref_id: string; attempts: number }[]) {
      const finish = (patch: Record<string, unknown>) => db.from('agent_outbox').update(patch).eq('id', row.id);
      const { data: conn } = await db.from('agent_connections').select('id, kind, name, config, vault_secret_names').eq('id', row.connection_id).maybeSingle();
      if (!conn) { await finish({ status: 'failed', error: 'The connection was deleted.' }); out.failed++; continue; }

      let msg;
      if (row.kind === 'flag') {
        const { data: f } = await db.from('agent_flags').select('id, rule_code, severity, title, why, suggested_action, item_type, person_id').eq('id', row.ref_id).maybeSingle();
        if (!f) { await finish({ status: 'failed', error: 'The item no longer exists.' }); out.failed++; continue; }
        let person: string | null = null;
        if (f.person_id) person = (await db.from('profiles').select('full_name').eq('id', f.person_id).maybeSingle()).data?.full_name ?? null;
        msg = formatFlag(f as FlagRow, person, appUrl);
        // Tag the person it is about (their manager for items waiting for review), so the right person is notified in the channel.
        let who: string | null = f.person_id ?? null;
        if (who && (f.rule_code === 'TK08' || f.rule_code === 'TK13')) {
          who = (await db.from('profiles').select('reporting_manager_id').eq('id', who).maybeSingle()).data?.reporting_manager_id ?? who;
        }
        let mention = await mentionFor(db, conn.kind, who);
        // A connection set to CC the manager also tags the person's manager (when it is not the person already tagged).
        if (mention && (conn.config as Record<string, unknown>).cc_manager === true && f.person_id) {
          const { data: fl } = await db.from('agent_flags').select('manager_id').eq('id', f.id).maybeSingle();
          const managerId = (fl?.manager_id as string | null) ?? ((await db.from('profiles').select('reporting_manager_id').eq('id', f.person_id).maybeSingle()).data?.reporting_manager_id as string | null) ?? null;
          if (managerId && managerId !== who) {
            const cc = await mentionFor(db, conn.kind, managerId);
            if (cc) mention = { ...mention, cc: { name: cc.name, id: cc.id } };
          }
        }
        msg = { ...msg, mention };
      } else {
        const { data: s } = await db.from('agent_summaries').select('period_kind, period_start, period_end, narrative').eq('id', row.ref_id).maybeSingle();
        if (!s) { await finish({ status: 'failed', error: 'The summary no longer exists.' }); out.failed++; continue; }
        msg = formatSummary(s as SummaryRow, appUrl);
      }

      const r = await deliver({ kind: conn.kind as ConnectionKind, name: conn.name, config: conn.config as Record<string, unknown> }, await readConnectionSecrets(db, conn as { id: string; vault_secret_names: string[] }), msg, { saveAccess: accessSaver(db, conn as { id: string; vault_secret_names: string[] }) });
      const attempts = row.attempts + 1;
      if (r.ok) {
        await finish({ status: 'sent', attempts, error: null, sent_at: new Date().toISOString() });
        await db.from('agent_connections').update({ status: 'connected', last_error: null }).eq('id', conn.id);
        out.sent++;
      } else {
        const last = attempts >= MAX_ATTEMPTS;
        await finish({ status: last ? 'failed' : 'pending', attempts, error: (r.error ?? 'Failed').slice(0, 300) });
        await db.from('agent_connections').update({ status: 'error', last_error: (r.error ?? 'Failed').slice(0, 300) }).eq('id', conn.id);
        if (last) out.failed++; else out.retried++;
      }
    }
    return new Response(JSON.stringify({ ok: true, ...out }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('agent-dispatch error', e instanceof Error ? e.message : e);
    return new Response(JSON.stringify({ ok: false, error: 'server_error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
