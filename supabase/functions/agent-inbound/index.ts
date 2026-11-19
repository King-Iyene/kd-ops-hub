// Ops Agent: inbound API. Other systems (billing, n8n, a monitoring tool) tell the agent something, or read its open items.
//
// Deploy: supabase functions deploy agent-inbound --no-verify-jwt   (it authenticates with an agent API key)
//
//   Authorization: Bearer kdagent_...          (or X-Agent-Key). Keys are created by a Super Admin in Connections.
//
// POST  { title, message?, severity?, id?, person_email?, data? }   needs scope flags:write
//         -> 201 { ok: true, id, occurrences }    the same `id` again updates the same Inbox item
// GET   ?limit=50                                                    needs scope flags:read
//         -> 200 { flags: [{ id, title, severity, status, rule_code, last_seen_at }] }
//
// Keys are stored as a hash, rate limited per minute, and revocable. Nothing here changes a business record.

import { getCorsHeaders } from '../_shared/cors.ts';
import { serviceClient } from '../_shared/agent-claude.ts';

const cors = (req: Request) => ({ ...getCorsHeaders(req), 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, x-agent-key, content-type' });
const json = (req: Request, body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json', ...extra } });
const MAX_BODY = 20_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'GET' && req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405);

  const header = req.headers.get('authorization') ?? '';
  const key = (header.toLowerCase().startsWith('bearer ') ? header.slice(7) : req.headers.get('x-agent-key') ?? '').trim();
  if (!key.startsWith('kdagent_')) return json(req, { error: 'unauthorized' }, 401);

  const db = serviceClient();
  try {
    const { data: k, error: kErr } = await db.rpc('agent_api_key_verify', { p_key: key });
    if (kErr) throw kErr;
    if (!k) return json(req, { error: 'unauthorized' }, 401);
    if (k.limited) return json(req, { error: 'rate_limited' }, 429, { 'Retry-After': '60' });
    const scopes: string[] = k.scopes ?? [];

    if (req.method === 'GET') {
      if (!scopes.includes('flags:read')) return json(req, { error: 'forbidden', detail: 'This key needs the flags:read scope.' }, 403);
      const n = Math.min(Math.max(Number(new URL(req.url).searchParams.get('limit')) || 50, 1), 100);
      const { data, error } = await db.from('agent_flags').select('id, title, severity, status, rule_code, last_seen_at')
        .in('status', ['open', 'snoozed']).order('last_seen_at', { ascending: false }).limit(n);
      if (error) throw error;
      return json(req, { flags: data ?? [] });
    }

    if (!scopes.includes('flags:write')) return json(req, { error: 'forbidden', detail: 'This key needs the flags:write scope.' }, 403);
    const raw = await req.text();
    if (raw.length > MAX_BODY) return json(req, { error: 'too_large' }, 413);
    let payload: unknown;
    try { payload = JSON.parse(raw); } catch { return json(req, { error: 'invalid_json' }, 400); }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return json(req, { error: 'invalid_json', detail: 'Send a JSON object.' }, 400);

    const { data, error } = await db.rpc('agent_inbound_create', { p_key_id: k.id, p_payload: payload });
    if (error) {
      if (/title_required/.test(error.message)) return json(req, { error: 'invalid', detail: 'title is required.' }, 400);
      throw error;
    }
    return json(req, { ok: true, id: data.id, occurrences: data.occurrences }, 201);
  } catch (e) {
    console.error('agent-inbound error', e instanceof Error ? e.message : e);
    return json(req, { error: 'server_error' }, 500);
  }
});
