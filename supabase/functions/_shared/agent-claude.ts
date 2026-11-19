// Ops Agent: the one place Claude is called from.
//
//   callClaude({ alias, ... })
//     1. reads agent_settings and the budget state (service role)
//     2. applies the gate: AI off, budget 100% (all AI off), budget 80% (non critical AI paused)
//     3. calls the Anthropic Messages API with a cached system prefix
//     4. logs tokens and an estimated cost to agent_ai_usage (success or failure)
//     5. never throws: on any problem it returns { ok: false, reason } and the caller uses its template
//
// The key is the Supabase secret ANTHROPIC_API_KEY, or (when a Super Admin pasted it into Settings) the Vault secret
// agent_anthropic_key. It is read here only, never returned and never logged.

import Anthropic from 'npm:@anthropic-ai/sdk@1.10.0';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import {
  buildSystem, estimateCostUsd, gate, modelFor, readUsage,
  type AgentSettingsLite, type BudgetState, type ModelAlias, type SystemBlock, type Usage,
} from './agent-claude-core.ts';

export interface CallOptions {
  alias: ModelAlias;
  /** What this call is for, written to the usage log (e.g. "flag_enrichment", "chat"). */
  feature: string;
  messages: Anthropic.MessageParam[];
  /** Instruction that changes per call; the identity and Operating Rules are added and cached for you. */
  task?: string;
  extraContext?: string[];
  maxTokens?: number;
  temperature?: number;
  userId?: string | null;
  /** Enrichment, automatic summaries and similar: paused when the budget passes 80%. */
  nonCritical?: boolean;
  /** Skip the "AI enabled" switch (the Super Admin's test button). A spent budget still stops it. */
  force?: boolean;
  tools?: Anthropic.Tool[];
}

export type CallResult =
  | { ok: true; text: string; model: string; usage: Usage; cost_usd: number; stop_reason: string | null; content: Anthropic.ContentBlock[] }
  | { ok: false; reason: 'ai_disabled' | 'budget_off' | 'budget_warn' | 'no_key' | 'error'; error?: string };

export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const VAULT_KEY_NAME = 'agent_anthropic_key';

/** The Claude key: the Supabase secret first, then the one a Super Admin saved from Settings (kept in Vault). */
export async function loadApiKey(db: SupabaseClient): Promise<{ key: string; source: 'env' | 'vault' } | null> {
  const env = Deno.env.get('ANTHROPIC_API_KEY');
  if (env) return { key: env, source: 'env' };
  try {
    const { data, error } = await db.rpc('agent_secret_get', { p_name: VAULT_KEY_NAME });
    if (!error && typeof data === 'string' && data) return { key: data, source: 'vault' };
  } catch { /* no key */ }
  return null;
}

export async function keyConfigured(db: SupabaseClient = serviceClient()): Promise<{ configured: boolean; source: 'env' | 'vault' | null }> {
  const k = await loadApiKey(db);
  return { configured: !!k, source: k?.source ?? null };
}

/** One tiny request with a key someone just supplied, before it is saved. Never logs or returns the key. */
export async function probeKey(key: string, model: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const client = new Anthropic({ apiKey: key, maxRetries: 0 });
    await client.messages.create({ model, max_tokens: 8, messages: [{ role: 'user', content: 'Reply OK' }] });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e instanceof Error ? e.message : String(e)).replaceAll(key, '[key]').slice(0, 300) };
  }
}

async function loadSettings(db: SupabaseClient): Promise<AgentSettingsLite> {
  const { data, error } = await db.from('agent_settings')
    .select('ai_enabled, model_fast, model_smart, model_prices, operating_rules').eq('id', true).single();
  if (error || !data) throw new Error(`agent settings unavailable: ${error?.message ?? 'no row'}`);
  return data as AgentSettingsLite;
}

export async function budgetState(db: SupabaseClient): Promise<BudgetState> {
  const { data, error } = await db.rpc('agent_ai_budget_state');
  if (error || !data) throw new Error(`budget state unavailable: ${error?.message ?? 'no data'}`);
  return data as BudgetState;
}

async function logUsage(db: SupabaseClient, row: {
  feature: string; model: string; usage: Usage; cost: number; ok: boolean; error?: string; userId?: string | null;
}) {
  const { error } = await db.rpc('agent_log_ai_usage', {
    p_feature: row.feature, p_model: row.model,
    p_input_tokens: row.usage.input_tokens, p_cached_input_tokens: row.usage.cache_read_input_tokens,
    p_cache_write_tokens: row.usage.cache_creation_input_tokens, p_output_tokens: row.usage.output_tokens,
    p_cost_usd: row.cost, p_ok: row.ok, p_error: row.error ?? null, p_user: row.userId ?? null,
  });
  if (error) console.error('agent_log_ai_usage failed', error.message); // never fail the caller over logging
}

export async function callClaude(opts: CallOptions, db: SupabaseClient = serviceClient()): Promise<CallResult> {
  let settings: AgentSettingsLite;
  let state: BudgetState;
  try {
    settings = await loadSettings(db);
    state = await budgetState(db);
  } catch (e) {
    return { ok: false, reason: 'error', error: e instanceof Error ? e.message : String(e) };
  }

  const g = gate(state, { nonCritical: opts.nonCritical, force: opts.force });
  if (!g.allowed) return { ok: false, reason: g.reason };

  const found = await loadApiKey(db);
  if (!found) return { ok: false, reason: 'no_key' };
  const apiKey = found.key;

  const model = modelFor(settings, opts.alias);
  const system: SystemBlock[] = buildSystem({ operatingRules: settings.operating_rules, extra: opts.extraContext, task: opts.task });
  const empty: Usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

  try {
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model,
      max_tokens: opts.maxTokens ?? 1024,
      ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
      system,
      messages: opts.messages,
      ...(opts.tools?.length ? { tools: opts.tools } : {}),
    });
    const usage = readUsage(res.usage as unknown as Record<string, number>);
    const { cost, priced } = estimateCostUsd(model, usage, settings.model_prices);
    if (!priced) console.warn(`agent: no price for model ${model}; cost logged as 0`);
    await logUsage(db, { feature: opts.feature, model, usage, cost, ok: true, userId: opts.userId });
    const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
    return { ok: true, text, model, usage, cost_usd: cost, stop_reason: res.stop_reason, content: res.content };
  } catch (e) {
    // Do not echo anything that could contain the key; the SDK's messages do not, but keep it short anyway.
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    await logUsage(db, { feature: opts.feature, model, usage: empty, cost: 0, ok: false, error: msg, userId: opts.userId });
    return { ok: false, reason: 'error', error: msg };
  }
}
