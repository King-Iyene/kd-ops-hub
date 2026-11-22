// Ops Agent: reads Zoho Cliq for messages that tag someone and get no answer (see _shared/agent-cliq-monitor.ts).
//
// Deploy: supabase functions deploy agent-cliq-monitor --no-verify-jwt   (the caller proves itself with the shared cron secret)
//
// Called by pg_cron through agent_cliq_watch_tick() at 7 past the hour; the database only calls it on working days, from the work start to half an
// hour after the work end, and at least 105 minutes after the last read (so about every 2 hours). With no or a wrong secret it answers 401 and does nothing.

import { serviceClient } from '../_shared/agent-claude.ts';
import { runCliqWatch } from '../_shared/agent-cliq-monitor.ts';

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
  try {
    const results = await runCliqWatch(serviceClient());
    return new Response(JSON.stringify({ ok: true, results }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('agent-cliq-monitor error', e instanceof Error ? e.message : e);
    return new Response(JSON.stringify({ ok: false, error: 'server_error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
