// Ops Agent: AI status and test endpoint (Phase 1). Later phases add actions here.
//
// Deploy: supabase functions deploy agent-ai --no-verify-jwt   (it checks the JWT and the role itself)
// Secret: supabase secrets set ANTHROPIC_API_KEY=...            (never put the key in the repo or the browser)
//
// POST { action: 'status' }                    any Super Admin or Admin
//   -> { key_configured, ai_enabled, mode, models, budget }
// POST { action: 'test', alias?: 'fast'|'smart' }   Super Admin only
//   -> one tiny real Claude call, logged to agent_ai_usage, returning tokens and estimated cost

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { getCorsHeaders } from '../_shared/cors.ts';
import { budgetState, callClaude, keyConfigured, serviceClient } from '../_shared/agent-claude.ts';

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { ...getCorsHeaders(req), 'Access-Control-Allow-Methods': 'POST, OPTIONS' } });
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405);

  // 1. Who is calling? The role is read from the database with the caller's own token.
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.toLowerCase().startsWith('bearer ')) return json(req, { error: 'unauthorized' }, 401);
  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await asUser.auth.getUser(auth.slice(7));
  if (userError || !userData?.user) return json(req, { error: 'unauthorized' }, 401);
  const { data: scope, error: scopeError } = await asUser.rpc('agent_my_scope');
  if (scopeError || !scope?.access) return json(req, { error: 'forbidden' }, 403);
  const canConfigure = scope.configure === true;

  let body: { action?: string; alias?: string } = {};
  try { body = await req.json(); } catch { /* empty body */ }

  const db = serviceClient();
  try {
    if (body.action === 'status') {
      const { data: s } = await db.from('agent_settings').select('mode, ai_enabled, model_fast, model_smart').eq('id', true).single();
      return json(req, {
        key_configured: keyConfigured(),
        ai_enabled: !!s?.ai_enabled,
        mode: s?.mode ?? 'observe',
        models: { fast: s?.model_fast, smart: s?.model_smart },
        budget: await budgetState(db),
      });
    }

    if (body.action === 'test') {
      if (!canConfigure) return json(req, { error: 'forbidden' }, 403);
      const alias = body.alias === 'smart' ? 'smart' : 'fast';
      const r = await callClaude({
        alias, feature: 'test', force: true, maxTokens: 16, temperature: 0, userId: userData.user.id,
        task: 'This is a connectivity check. Reply with the single word OK.',
        messages: [{ role: 'user', content: 'ping' }],
      }, db);
      await db.rpc('agent_audit_write', { p_actor: userData.user.id, p_action: 'ai.test', p_entity_type: 'agent_ai', p_entity_id: alias, p_detail: { ok: r.ok, reason: r.ok ? null : r.reason } }).then(() => {}, () => {});
      if (!r.ok) return json(req, { ok: false, reason: r.reason, error: r.error ?? null, key_configured: keyConfigured() });
      return json(req, { ok: true, model: r.model, text: r.text, usage: r.usage, cost_usd: r.cost_usd });
    }

    return json(req, { error: 'unknown_action' }, 400);
  } catch (e) {
    console.error('agent-ai error', e instanceof Error ? e.message : e);
    return json(req, { error: 'server_error' }, 500);
  }
});
