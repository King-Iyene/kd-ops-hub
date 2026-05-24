// supabase/functions/fx-rate-sync/index.ts
//
// Fetches the USD→NGN exchange rate and records it via record_fetched_fx_rate(),
// which applies the deviation guard: a rate within company_settings.
// fx_deviation_threshold_pct of the last active rate goes live; a larger move is
// parked as 'pending_review' for a human to approve (maker-checker on the rate).
//
// Source: open.er-api.com (no API key) — the same provider the chatbot uses.
//
// SAFETY: read-only against the FX provider; the only DB write is one atomic RPC
// call. On any provider error it returns ok:false and writes NOTHING — a failed
// fetch never disturbs the current active rate.
//
// AUTH (deployed --no-verify-jwt, validated in code):
//   • X-Cron-Secret == CRON_SHARED_SECRET   (pg_cron daily tick), or
//   • a Supabase JWT for a super_admin / admin / finance user ("Fetch now").
//
// Deploy:  supabase functions deploy fx-rate-sync --no-verify-jwt
// Secrets: CRON_SHARED_SECRET already set (reused). Optional FX_BASE/FX_QUOTE.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY    = Deno.env.get("SUPABASE_ANON_KEY")!;
const CRON_SHARED_SECRET   = Deno.env.get("CRON_SHARED_SECRET");
const FX_BASE  = (Deno.env.get("FX_BASE")  ?? "USD").toUpperCase();
const FX_QUOTE = (Deno.env.get("FX_QUOTE") ?? "NGN").toUpperCase();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function fetchWithRetry(url: string, attempts = 3): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.status >= 500 && i < attempts - 1) { await new Promise((r) => setTimeout(r, 1000 * 2 ** i)); continue; }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
  throw lastErr ?? new Error("fetch failed");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // ── Auth gate ──────────────────────────────────────────────────────────────
  const isCron = !!CRON_SHARED_SECRET && req.headers.get("X-Cron-Secret") === CRON_SHARED_SECRET;
  if (!isCron) {
    const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!bearer) return json(401, { ok: false, error: "Not authenticated" });
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: { user }, error: authErr } = await anon.auth.getUser(bearer);
    if (authErr || !user) return json(401, { ok: false, error: authErr?.message ?? "Not authenticated" });
    const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
    const { data: profile } = await svc.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!["super_admin", "admin", "finance"].includes((profile as any)?.role)) {
      return json(403, { ok: false, error: "Requires admin or finance role" });
    }
  }

  try {
    // ── 1. Fetch the rate. open.er-api.com returns { rates: { NGN: 1234.5, ... } }
    const res = await fetchWithRetry(`https://open.er-api.com/v6/latest/${FX_BASE}`);
    if (!res.ok) return json(200, { ok: false, error: `FX provider HTTP ${res.status} — no rate recorded` });
    const data = await res.json().catch(() => null);
    const rate = data?.rates?.[FX_QUOTE];
    if (typeof rate !== "number" || !(rate > 0)) {
      return json(200, { ok: false, error: `FX provider returned no valid ${FX_BASE}/${FX_QUOTE} rate — nothing recorded` });
    }

    // ── 2. Record via the guarded RPC (atomic: deviation check + supersede + mirror)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
    const { data: row, error } = await supabase.rpc("record_fetched_fx_rate", {
      p_base: FX_BASE,
      p_quote: FX_QUOTE,
      p_rate: rate,
      p_source: "auto:open.er-api.com",
    });
    if (error) return json(200, { ok: false, error: `record_fetched_fx_rate failed: ${error.message}` });

    const r = Array.isArray(row) ? row[0] : row;
    console.log(`[fx-rate-sync] ${FX_BASE}/${FX_QUOTE}=${rate} status=${r?.status} deviation=${r?.deviation_pct ?? "n/a"}`);
    return json(200, {
      ok: true,
      base: FX_BASE,
      quote: FX_QUOTE,
      rate,
      status: r?.status,
      deviation_pct: r?.deviation_pct,
      held_for_review: r?.status === "pending_review",
    });
  } catch (err) {
    return json(200, { ok: false, error: (err as Error)?.message ?? String(err) });
  }
});
