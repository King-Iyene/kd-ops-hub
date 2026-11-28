// Crew in Zoho Cliq: posts new proposals waiting for the owner, and carries out his approve / reject / reply messages (see _shared/crew-cliq.ts).
//
// Deploy: supabase functions deploy crew-cliq --no-verify-jwt   (the caller proves itself with the shared cron secret)
// Secrets: CRON_SHARED_SECRET (already set). The Cliq sign-in comes from the chosen Ops Agent Cliq connection; nothing new to configure.
//
// Called every minute by pg_cron (crew_cliq_tick), and only when the owner has switched Cliq commands on and typed his Cliq account in
// Crew > Settings > Cliq. With no or a wrong secret it answers 401 and does nothing. Switched off, it does nothing at all.

import { serviceClient } from '../_shared/agent-claude.ts';
import { runCrewCliq } from '../_shared/crew-cliq.ts';

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
  try {
    return json(await runCrewCliq(serviceClient()));
  } catch (e) {
    console.error('crew-cliq error', e instanceof Error ? e.message : e);
    return json({ ok: false, error: 'server_error' }, 500);
  }
});
