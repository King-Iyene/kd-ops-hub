// Ops Agent: AI status, test, and the write-only Claude key.
//
// Deploy: supabase functions deploy agent-ai --no-verify-jwt   (it checks the JWT and the role itself)
//
// POST { action: 'status' }                         any Super Admin or Admin
//   -> { key_configured, key_source: 'env'|'vault'|null, ai_enabled, models, budget }
// POST { action: 'test', alias?: 'fast'|'smart' }   Super Admin only: one tiny real Claude call, logged with its cost
// POST { action: 'set_key', key }                   Super Admin only: the key is tried first; only a key Claude accepts is saved (Vault)
// POST { action: 'clear_key' }                      Super Admin only: removes the key saved from Settings
// POST { action: 'classify_sites', domains: [] }    Super Admin only: Claude's view of up to 6 domains (work / personal / unknown), cached
//   -> { ok: true, results: [{ domain, verdict, reason }] }   Only domain names are sent to Claude, never a page, a path or a person.
//
// The key is never returned, logged or audited. Settings shows only "set / not set".

import { getCorsHeaders } from '../_shared/cors.ts';
import { authenticateAgentCaller, jsonResponse } from '../_shared/agent-auth.ts';
import { VAULT_KEY_NAME, budgetState, callClaude, keyConfigured, probeKey, serviceClient } from '../_shared/agent-claude.ts';
import { SITE_TASK, cleanDomain, parseSiteVerdicts, type SiteResult } from '../_shared/agent-sites-core.ts';

const cors = (req: Request) => ({ ...getCorsHeaders(req), 'Access-Control-Allow-Methods': 'POST, OPTIONS' });

/** Turns the provider's wording into what a person can act on. */
export function explainKeyError(raw: string): string {
  if (/workspace/i.test(raw)) {
    return 'This key is not tied to a workspace, so it cannot send messages. In the Anthropic Console create the key inside a workspace (Workspaces, choose one, API keys) and paste that one.';
  }
  if (/invalid x-api-key|authentication|401|permission/i.test(raw)) return 'Claude rejected this key. Check that it was copied whole and is still active.';
  if (/credit|billing|balance/i.test(raw)) return 'The key is valid but the account has no credit. Add credit in the Anthropic Console.';
  if (/not_found|model/i.test(raw)) return 'Claude could not find the model set in Settings. Check the model names.';
  return 'Claude could not be reached with this key.';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return jsonResponse(cors(req), { error: 'method_not_allowed' }, 405);

  const auth = await authenticateAgentCaller(req);
  if (!auth.ok) return jsonResponse(cors(req), { error: auth.error }, auth.status);
  const { caller } = auth;

  let body: { action?: string; alias?: string; key?: string; domains?: unknown } = {};
  try { body = await req.json(); } catch { /* empty body */ }

  const db = serviceClient();
  try {
    if (body.action === 'status') {
      const { data: s } = await db.from('agent_settings').select('ai_enabled, model_fast, model_smart').eq('id', true).single();
      const k = await keyConfigured(db);
      return jsonResponse(cors(req), {
        key_configured: k.configured,
        key_source: k.source,
        ai_enabled: !!s?.ai_enabled,
        models: { fast: s?.model_fast, smart: s?.model_smart },
        budget: await budgetState(db),
      });
    }

    if (!caller.canConfigure) return jsonResponse(cors(req), { error: 'forbidden' }, 403);

    if (body.action === 'test') {
      const alias = body.alias === 'smart' ? 'smart' : 'fast';
      const r = await callClaude({
        alias, feature: 'test', force: true, maxTokens: 16, temperature: 0, userId: caller.userId,
        task: 'This is a connectivity check. Reply with the single word OK.',
        messages: [{ role: 'user', content: 'ping' }],
      }, db);
      await db.rpc('agent_audit_write', { p_actor: caller.userId, p_action: 'ai.test', p_entity_type: 'agent_ai', p_entity_id: alias, p_detail: { ok: r.ok, reason: r.ok ? null : r.reason } }).then(() => {}, () => {});
      const k = await keyConfigured(db);
      if (!r.ok) return jsonResponse(cors(req), { ok: false, reason: r.reason, error: r.error ? explainKeyError(r.error) : null, key_configured: k.configured });
      return jsonResponse(cors(req), { ok: true, model: r.model, text: r.text, usage: r.usage, cost_usd: r.cost_usd });
    }

    if (body.action === 'classify_sites') {
      const domains = [...new Set((Array.isArray(body.domains) ? body.domains : []).map(cleanDomain).filter((d): d is string => !!d))].slice(0, 6);
      if (domains.length === 0) return jsonResponse(cors(req), { ok: true, results: [] });
      const hash = async (d: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(d)))].map((b) => b.toString(16).padStart(2, '0')).join('');
      const hashes = await Promise.all(domains.map(hash));
      const { data: cached } = await db.from('agent_text_checks').select('text_hash, verdict, created_at').eq('check_kind', 'site_verdict').in('text_hash', hashes)
        .gt('created_at', new Date(Date.now() - 30 * 86_400_000).toISOString());
      const known = new Map<string, SiteResult>();
      for (const row of (cached ?? []) as { text_hash: string; verdict: SiteResult }[]) known.set(row.text_hash, row.verdict);
      const missing = domains.filter((_, i) => !known.has(hashes[i]));
      if (missing.length > 0) {
        const r = await callClaude({
          alias: 'fast', feature: 'classify_sites', maxTokens: 700, temperature: 0, nonCritical: true, userId: caller.userId,
          task: SITE_TASK, messages: [{ role: 'user', content: JSON.stringify(missing) }],
        }, db);
        if (!r.ok) return jsonResponse(cors(req), { ok: false, reason: r.reason, error: r.error ? explainKeyError(r.error) : null });
        const fresh = parseSiteVerdicts(r.text, missing);
        for (const v of fresh) {
          const h = await hash(v.domain);
          known.set(h, v);
          if (v.verdict !== 'unknown') await db.from('agent_text_checks').upsert({ text_hash: h, check_kind: 'site_verdict', verdict: v, model: r.model, created_at: new Date().toISOString() });
        }
      }
      return jsonResponse(cors(req), { ok: true, results: domains.map((d, i) => known.get(hashes[i]) ?? { domain: d, verdict: 'unknown', reason: 'Claude could not tell.' }) });
    }

    if (body.action === 'set_key') {
      const key = typeof body.key === 'string' ? body.key.trim() : '';
      if (!/^sk-ant-[A-Za-z0-9_-]{20,400}$/.test(key)) {
        return jsonResponse(cors(req), { ok: false, reason: 'bad_format', error: 'That does not look like an Anthropic API key (it starts with sk-ant-).' });
      }
      const { data: s } = await db.from('agent_settings').select('model_fast').eq('id', true).single();
      const probe = await probeKey(key, s?.model_fast ?? 'claude-haiku-5-5');
      if (!probe.ok) return jsonResponse(cors(req), { ok: false, reason: 'rejected', error: explainKeyError(probe.error) });
      const { error } = await db.rpc('agent_secret_set', { p_name: VAULT_KEY_NAME, p_value: key });
      if (error) {
        console.error('agent_secret_set failed', error.message);
        return jsonResponse(cors(req), { ok: false, reason: 'save_failed', error: 'The key works but could not be saved.' });
      }
      await db.rpc('agent_audit_write', { p_actor: caller.userId, p_action: 'ai.key_set', p_entity_type: 'agent_ai', p_entity_id: 'claude', p_detail: {} }).then(() => {}, () => {});
      return jsonResponse(cors(req), { ok: true });
    }

    if (body.action === 'clear_key') {
      await db.rpc('agent_secret_delete', { p_name: VAULT_KEY_NAME });
      await db.rpc('agent_audit_write', { p_actor: caller.userId, p_action: 'ai.key_cleared', p_entity_type: 'agent_ai', p_entity_id: 'claude', p_detail: {} }).then(() => {}, () => {});
      return jsonResponse(cors(req), { ok: true });
    }

    return jsonResponse(cors(req), { error: 'unknown_action' }, 400);
  } catch (e) {
    console.error('agent-ai error', e instanceof Error ? e.message : e);
    return jsonResponse(cors(req), { error: 'server_error' }, 500);
  }
});
