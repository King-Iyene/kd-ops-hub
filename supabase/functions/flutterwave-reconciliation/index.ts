// supabase/functions/flutterwave-reconciliation/index.ts
//
// Safety net for Flutterwave transfers that got stuck in 'pending' because
// the webhook never arrived (network, deployment, dashboard tab was wrong).
// Mirrors paystack-reconciliation/index.ts.
//
// Auth model (same as Paystack):
//   • Manual call from the UI: requires admin/super_admin/finance JWT.
//   • Scheduled call (pg_cron / external scheduler): pass { scheduled: true }
//     and include the SERVICE_ROLE_KEY in Authorization.
//
// Deploy: supabase functions deploy flutterwave-reconciliation --no-verify-jwt
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
//      FLUTTERWAVE_SECRET_KEY_TEST / _LIVE (mode-picked per invocation)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { getCorsHeaders } from "../_shared/cors.ts";
import { constantTimeEquals } from "../_shared/timing.ts";

const FLUTTERWAVE_BASE = "https://api.flutterwave.com/v3";
const STUCK_THRESHOLD_HOURS = 1;
const MAX_ITEMS_PER_RUN = 200;

/** A hung verify call would otherwise stall the whole per-item loop. */
const FLUTTERWAVE_FETCH_TIMEOUT_MS = 20_000;
const FW_MIN_MS = 700;   // ~85 req/min — well below FW's per-endpoint limit

async function getFwSecret(service: any): Promise<string> {
  const { data } = await service
    .from("company_settings")
    .select("flutterwave_mode")
    .eq("id", "00000000-0000-0000-0000-000000000001")
    .maybeSingle();
  const mode = ((data as any)?.flutterwave_mode || "test") as "test" | "live";
  const envName = mode === "live"
    ? "FLUTTERWAVE_SECRET_KEY_LIVE"
    : "FLUTTERWAVE_SECRET_KEY_TEST";
  const secret = Deno.env.get(envName);
  if (!secret) {
    throw new Error(`${envName} secret not set — cannot reconcile.`);
  }
  return secret;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const service = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const scheduled = body?.scheduled === true;

    let triggeredBy: string | null = null;

    if (scheduled) {
      // Timing-safe comparison — mirrors paystack-reconciliation, which
      // already used timingSafeEqual here; this one used a plain !== that
      // leaks comparison timing on a security-sensitive service-role check.
      const auth = req.headers.get("Authorization") ?? "";
      const token = auth.replace("Bearer ", "");
      if (!constantTimeEquals(token, SERVICE_ROLE)) {
        return json({ error: "Scheduled runs require service-role auth" }, 401, corsHeaders);
      }
    } else {
      const authHeader = req.headers.get("Authorization") ?? "";
      const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!);
      const { data: { user } } = await userClient.auth.getUser(
        authHeader.replace("Bearer ", ""),
      );
      if (!user) return json({ error: "Not authenticated" }, 401, corsHeaders);
      const { data: profile } = await service
        .from("profiles").select("role").eq("id", user.id).single();
      if (!["super_admin", "admin", "finance"].includes(profile?.role)) {
        return json({ error: "Insufficient permissions" }, 403, corsHeaders);
      }
      triggeredBy = user.id;
    }

    const secret = await getFwSecret(service);
    const cutoff = new Date(Date.now() - STUCK_THRESHOLD_HOURS * 3600_000).toISOString();
    const { data: stuck, error: fetchErr } = await service
      .from("batch_items")
      .select("id, flutterwave_reference, full_name, status, batch_id")
      .in("status", ["pending", "retry"])
      .not("flutterwave_reference", "is", null)
      .lt("created_at", cutoff)
      .order("created_at", { ascending: true })
      .limit(MAX_ITEMS_PER_RUN);
    if (fetchErr) throw fetchErr;

    const items = (stuck || []) as any[];
    let succeeded = 0;
    let failed = 0;
    let unchanged = 0;
    let lastCall = 0;

    for (const it of items) {
      const wait = FW_MIN_MS - (Date.now() - lastCall);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      try {
        lastCall = Date.now();
        const res = await fetch(
          `${FLUTTERWAVE_BASE}/transfers?reference=${encodeURIComponent(it.flutterwave_reference)}`,
          { headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(FLUTTERWAVE_FETCH_TIMEOUT_MS) },
        );
        if (res.status === 429) {
          const retryAfter = Math.min(60, Math.max(1, Number(res.headers.get("retry-after")) || 5));
          console.warn(`[flutterwave-reconciliation] 429; sleeping ${retryAfter}s, stopping run`);
          await new Promise((r) => setTimeout(r, retryAfter * 1000));
          break;
        }
        if (!res.ok) { unchanged++; continue; }
        const body = await res.json();
        const t = Array.isArray(body?.data) ? body.data[0] : body?.data;
        if (!t) { unchanged++; continue; }

        const raw = String(t.status || "").toLowerCase();
        const feeNgn = Number(t.fee || 0) || 0;

        if (raw === "successful" || raw === "success") {
          const rpc = await service.rpc("process_flutterwave_webhook", {
            p_event: "transfer.success",
            p_reference: it.flutterwave_reference,
            p_failure_reason: null,
            p_flutterwave_raw: t,
            p_flutterwave_fee_ngn: feeNgn,
          });
          if (rpc.error) { console.warn("[reconciliation] success RPC failed for", it.id, rpc.error); unchanged++; }
          else succeeded++;
        } else if (raw === "reversed") {
          const rpc = await service.rpc("process_flutterwave_webhook", {
            p_event: "transfer.reversed",
            p_reference: it.flutterwave_reference,
            p_failure_reason: t.complete_message || "Reversed by Flutterwave",
            p_flutterwave_raw: t,
            p_flutterwave_fee_ngn: 0,
          });
          if (rpc.error) { console.warn("[reconciliation] reversed RPC failed for", it.id, rpc.error); unchanged++; }
          else failed++;
        } else if (raw === "failed") {
          const rpc = await service.rpc("process_flutterwave_webhook", {
            p_event: "transfer.failed",
            p_reference: it.flutterwave_reference,
            p_failure_reason: t.complete_message || "Flutterwave reported failed",
            p_flutterwave_raw: t,
            p_flutterwave_fee_ngn: 0,
          });
          if (rpc.error) { console.warn("[reconciliation] failed RPC failed for", it.id, rpc.error); unchanged++; }
          else failed++;
        } else {
          // NEW / PROCESSING / PENDING — no terminal change yet.
          unchanged++;
        }
      } catch (e) {
        unchanged++;
        console.warn("[flutterwave-reconciliation] item failed:", it.id, e);
      }
    }

    // Recompute parent batch statuses for anything we touched.
    const touched = Array.from(new Set(items.map((i: any) => i.batch_id)));
    for (const bid of touched) {
      try { await service.rpc("sync_batch_status_from_items", { p_batch_id: bid }); }
      catch (e) { console.warn("[reconciliation] sync failed for", bid, e); }
    }

    return json({
      ok: true,
      items_checked: items.length,
      succeeded,
      failed,
      unchanged,
      triggered_by: triggeredBy,
    }, 200, corsHeaders);
  } catch (err) {
    console.error("[flutterwave-reconciliation]", err);
    return json({ ok: false, error: "Reconciliation failed. Please try again later." }, 500, corsHeaders);
  }
});

function json(body: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
