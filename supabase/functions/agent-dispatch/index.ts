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
import { validDmTarget } from '../_shared/agent-cliq-core.ts';
import { dmFailureText } from '../_shared/crew-cliq-core.ts';
import { ccFor, managerOf, mentionFor } from '../_shared/agent-mention.ts';
import { accessSaver, readConnectionSecrets } from '../_shared/agent-conn-secrets.ts';
import { buildRecordMessage, effectiveConfig } from '../_shared/tm-record-message.ts';
import { MAX_ATTEMPTS, formatCrewMessage, formatFlag, formatFollowup, formatSummary, isTeamRule, type FlagRow, type SummaryRow } from '../_shared/agent-dispatch-core.ts';

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
    const { data: rows } = await db.from('agent_outbox').select('id, connection_id, kind, ref_id, rule_id, attempts').eq('status', 'pending').lt('attempts', MAX_ATTEMPTS)
      .order('created_at', { ascending: true }).limit(20);
    for (const row of (rows ?? []) as { id: string; connection_id: string; kind: 'flag' | 'summary' | 'record' | 'followup' | 'crew'; ref_id: string; rule_id: string | null; attempts: number }[]) {
      const finish = (patch: Record<string, unknown>) => db.from('agent_outbox').update(patch).eq('id', row.id);
      const { data: conn } = await db.from('agent_connections').select('id, kind, name, config, vault_secret_names').eq('id', row.connection_id).maybeSingle();
      if (!conn) { await finish({ status: 'failed', error: 'The connection was deleted.' }); out.failed++; continue; }
      // Take the message before sending it: two senders running at once (the every-minute one and a "send now") must never both send it.
      const { data: claimed } = await db.from('agent_outbox').update({ attempts: row.attempts + 1 }).eq('id', row.id).eq('status', 'pending').eq('attempts', row.attempts).select('id');
      if (!claimed || claimed.length === 0) continue;
      let sendConfig = conn.config as Record<string, unknown>;

      let msg;
      let dmTarget: string | null = null;
      if (row.kind === 'flag') {
        const { data: f } = await db.from('agent_flags').select('id, rule_code, severity, title, why, suggested_action, item_type, person_id').eq('id', row.ref_id).maybeSingle();
        if (!f) { await finish({ status: 'failed', error: 'The item no longer exists.' }); out.failed++; continue; }
        if (!isTeamRule(f.rule_code)) { await finish({ status: 'failed', error: 'Not a team item: it stays in the Inbox.' }); out.failed++; continue; }
        let person: string | null = null;
        if (f.person_id) person = (await db.from('profiles').select('full_name').eq('id', f.person_id).maybeSingle()).data?.full_name ?? null;
        // Tag the person it is about (their manager for items waiting for review), so the right person is notified in the channel,
        // and CC the person's manager unless the connection says not to.
        let who: string | null = f.person_id ?? null;
        if (who && (f.rule_code === 'TK08' || f.rule_code === 'TK13')) who = (await managerOf(db, who)) ?? who;
        const toManager = who !== null && who !== f.person_id;
        const mention = await mentionFor(db, conn.kind, who);
        const cc = (conn.config as Record<string, unknown>).cc_manager !== false && f.person_id ? await ccFor(db, conn.kind, f.person_id, who) : undefined;
        msg = { ...formatFlag(f as FlagRow, person, { toManager }), mention, cc: toManager ? undefined : cc };
      } else if (row.kind === 'followup') {
        // Nothing changed after a message: a follow-up to the person, then (a day later) their manager is asked to step in.
        const { data: fu } = await db.from('agent_followups').select('flag_id, stage').eq('id', row.ref_id).maybeSingle();
        const { data: f } = fu ? await db.from('agent_flags').select('id, rule_code, severity, title, why, suggested_action, item_type, person_id').eq('id', fu.flag_id).maybeSingle() : { data: null };
        if (!fu || !f) { await finish({ status: 'failed', error: 'The item no longer exists.' }); out.failed++; continue; }
        if (!isTeamRule(f.rule_code)) { await finish({ status: 'failed', error: 'Not a team item: it stays in the Inbox.' }); out.failed++; continue; }
        const person = f.person_id ? (await db.from('profiles').select('full_name').eq('id', f.person_id).maybeSingle()).data?.full_name ?? null : null;
        const managerId = await managerOf(db, f.person_id);
        const managerName = managerId ? (await db.from('profiles').select('full_name').eq('id', managerId).maybeSingle()).data?.full_name ?? null : null;
        const toManager = fu.stage >= 2 && !!managerId;
        const mention = await mentionFor(db, conn.kind, toManager ? managerId : f.person_id);
        const cc = !toManager && (conn.config as Record<string, unknown>).cc_manager !== false && f.person_id ? await ccFor(db, conn.kind, f.person_id, f.person_id) : undefined;
        msg = { ...formatFollowup(f as FlagRow, person, fu.stage, managerName), mention, cc };
      } else if (row.kind === 'crew') {
        // A message an AI executive wrote to the owner, posted in the chosen channel with the owner tagged.
        const { data: m } = await db.from('crew_messages').select('id, from_agent, kind, body').eq('id', row.ref_id).maybeSingle();
        if (!m) { await finish({ status: 'failed', error: 'The message no longer exists.' }); out.failed++; continue; }
        const { data: a } = m.from_agent ? await db.from('crew_agents').select('name, title').eq('id', m.from_agent).maybeSingle() : { data: null };
        const { data: st } = await db.from('crew_settings').select('notify_profile_id, cliq_dm, cliq_owner_id').eq('id', true).maybeSingle();
        const crewMsg = formatCrewMessage({ kind: m.kind as string, body: m.body as string }, (a?.name as string | undefined) ?? 'Crew', (a?.title as string | undefined) ?? '');
        // "Me, as a direct message": the owner is sent the message directly (no tag needed) instead of it being posted in the channel.
        const ownerCliq = st?.cliq_dm === true && (conn.config as Record<string, unknown>).mode === 'api' && validDmTarget(st?.cliq_owner_id) ? (st?.cliq_owner_id as string) : null;
        if (ownerCliq) { dmTarget = ownerCliq; msg = { ...crewMsg, cliq: { dm: ownerCliq } }; }
        else msg = { ...crewMsg, mention: await mentionFor(db, conn.kind, st?.notify_profile_id as string | null | undefined) };
      } else if (row.kind === 'record') {
        // A new entry in a Task table, sent through the rule that asked for it.
        const built = row.rule_id ? await buildRecordMessage(db, row.rule_id, row.ref_id, appUrl, conn.kind as string) : null;
        if (!built || !built.ok) { await finish({ status: 'failed', error: (built && !built.ok ? built.error : 'The rule no longer exists.').slice(0, 300) }); out.failed++; continue; }
        msg = built.msg;
        sendConfig = effectiveConfig(conn.config as Record<string, unknown>, conn.kind as string, built.rule);
      } else {
        const { data: s } = await db.from('agent_summaries').select('period_kind, period_start, period_end, narrative, metrics').eq('id', row.ref_id).maybeSingle();
        if (!s) { await finish({ status: 'failed', error: 'The summary no longer exists.' }); out.failed++; continue; }
        msg = formatSummary(s as SummaryRow);
        // The Monday scorecard names each manager as "@Name": tag them in Cliq and Slack.
        if (s.period_kind === 'scorecard') {
          const managers = ((s.metrics as { managers?: { manager_id: string | null }[] } | null)?.managers ?? []).filter((m) => m.manager_id).slice(0, 40);
          const tags = await Promise.all(managers.map((m) => mentionFor(db, conn.kind, m.manager_id)));
          msg = { ...msg, mentions: tags.filter((t): t is { name: string; id: string } => !!t) };
        }
      }

      const r = await deliver({ kind: conn.kind as ConnectionKind, name: conn.name, config: sendConfig }, await readConnectionSecrets(db, conn as { id: string; vault_secret_names: string[] }), msg, { saveAccess: accessSaver(db, conn as { id: string; vault_secret_names: string[] }) });
      const attempts = row.attempts + 1;
      if (r.ok) {
        await finish({ status: 'sent', attempts, error: null, sent_at: new Date().toISOString() });
        if (row.kind === 'crew') await db.from('crew_messages').update({ cliq_sent_at: new Date().toISOString() }).eq('id', row.ref_id);
        if (row.kind === 'record' && row.rule_id) await db.from('tm_table_connections').update({ last_sent_at: new Date().toISOString() }).eq('id', row.rule_id);
        await db.from('agent_connections').update({ status: 'connected', last_error: null }).eq('id', conn.id);
        if (dmTarget) await db.from('crew_settings').update({ cliq_error: null, cliq_error_at: null }).eq('id', true).not('cliq_error', 'is', null);
        out.sent++;
      } else {
        // A direct message that Zoho refuses with 401 or 403 needs one more permission: say so, in words, on the Crew settings card.
        if (dmTarget) await db.from('crew_settings').update({ cliq_error: dmFailureText(r.status, conn.name as string), cliq_error_at: new Date().toISOString() }).eq('id', true);
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
