// Crew gateway: the single door the AI agents use to read their allowed data, put proposals in the approval queue, talk and learn.
//
// Deploy: supabase functions deploy crew-gateway --no-verify-jwt   (an agent proves itself with its OWN token, not a user session)
//
// Request:  POST  Authorization: Bearer crew_<48 hex>   body {"op": "...", ...arguments}   (operations: see OPS in _shared/crew-gateway-core.ts)
// The token is checked against a hash in the database (crew_agent_by_token). Each operation is one database function that checks the
// agent's permissions again, so this file cannot widen them. There is no operation here that writes a finance record, deletes,
// pays, or touches GitHub, Vercel or Supabase: those need the owner's approval in the app and are applied by the database.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { GatewayError, bearer, describeDbError, makeLimiter, plan, type Json } from '../_shared/crew-gateway-core.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
const allowed = makeLimiter(90);

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply({ error: 'use POST' }, 405);
  const token = bearer(req.headers.get('authorization'));
  if (!token) return reply({ error: 'unauthorized' }, 401);
  const { data: agentId, error: authErr } = await db.rpc('crew_agent_by_token', { p_token: token });
  if (authErr || !agentId) return reply({ error: 'unauthorized' }, 401);
  if (!allowed(agentId as string)) return reply({ error: 'slow down: too many requests this minute' }, 429);

  let body: Json;
  try {
    const raw = await req.text();
    if (raw.length > 200_000) return reply({ error: 'request too big' }, 413);
    body = JSON.parse(raw);
    if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new Error('not an object');
  } catch { return reply({ error: 'send a JSON object' }, 400); }

  try {
    const lookup = async (slug: string) => {
      const { data } = await db.from('crew_agents').select('id').eq('slug', slug).eq('active', true).maybeSingle();
      return (data?.id as string | undefined) ?? null;
    };
    const p = await plan(body.op, body, agentId as string, lookup);

    if ('read' in p) {
      if (p.read === 'whoami') {
        const [{ data: a }, { data: priv }] = await Promise.all([
          db.from('crew_agents').select('id, slug, name, title, role, department, company, reports_to, status, activity').eq('id', agentId).single(),
          db.from('crew_agent_private').select('persona, instructions, notes, model, advisor_model, allowed_actions, max_pending').eq('agent_id', agentId).single(),
        ]);
        return reply({ ok: true, agent: a, ...priv });
      }
      if (p.read === 'team') {
        const { data } = await db.from('crew_agents').select('slug, name, title, role, department, reports_to, status, activity').eq('active', true).order('department').order('name');
        return reply({ ok: true, team: data });
      }
      let q = db.from('crew_proposals').select('id, action, summary, status, risk, decision_note, error, created_at, decided_at').eq('agent_id', agentId).order('created_at', { ascending: false }).limit(p.limit ?? 30);
      if (p.status) q = q.eq('status', p.status);
      const { data } = await q;
      return reply({ ok: true, proposals: data });
    }

    const { data, error } = await db.rpc(p.fn, p.args);
    if (error) {
      const d = describeDbError(error);
      if (d.status >= 500) console.error('crew-gateway', body.op, error.code, error.message);
      return reply({ ok: false, error: d.message }, d.status);
    }
    return reply({ ok: true, result: data });
  } catch (e) {
    if (e instanceof GatewayError) return reply({ ok: false, error: e.message }, e.status);
    console.error('crew-gateway unexpected', e);
    return reply({ ok: false, error: 'unexpected error' }, 500);
  }
});
