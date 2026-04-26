// supabase/functions/paystack-reconciliation/index.ts
//
// Walks every batch_item that's been stuck in 'pending' (or 'retry') state
// for more than the threshold and asks Paystack what actually happened.
// This is the safety net for transfers that succeeded silently — the
// webhook never arrived, the row stayed pending, finance was none the
// wiser. Run this daily to catch them.
//
// Auth model:
//   • Manual call from the UI: requires admin/super_admin/finance JWT.
//   • Scheduled call (pg_cron / external scheduler):
//     pass `scheduled: true` in the body and the SERVICE_ROLE_KEY in the
//     Authorization header. The function won't accept `scheduled: true`
//     unless the bearer is the service role.
//
// Deploy:
//   supabase functions deploy paystack-reconciliation --no-verify-jwt
//
// Env required:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//   PAYSTACK_SECRET_KEY  (or company_settings.paystack_secret_key_enc)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PAYSTACK_BASE = "https://api.paystack.co";

/** How long an item must have been pending before we'll re-check it. */
const STUCK_THRESHOLD_HOURS = 1;

/** Cap per run — protects against accidentally hitting Paystack 1000 times. */
const MAX_ITEMS_PER_RUN = 200;

async function getPaystackSecret(service: any): Promise<string> {
  const env = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (env) return env;
  const { data } = await service
    .from("company_settings")
    .select("paystack_secret_key_enc")
    .eq("id", "00000000-0000-0000-0000-000000000001")
    .maybeSingle();
  const dbSecret = data?.paystack_secret_key_enc;
  if (dbSecret) return dbSecret;
  throw new Error("PAYSTACK_SECRET_KEY not configured");
}

serve(async (req) => {
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
      // Service-role bearer required — can't be triggered by a regular user.
      const auth = req.headers.get("Authorization") ?? "";
      if (auth.replace("Bearer ", "") !== SERVICE_ROLE) {
        return json({ error: "Scheduled runs require service-role auth" }, 401);
      }
    } else {
      // Manual run — require admin/finance/super_admin.
      const authHeader = req.headers.get("Authorization") ?? "";
      const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!);
      const { data: { user } } = await userClient.auth.getUser(
        authHeader.replace("Bearer ", ""),
      );
      if (!user) return json({ error: "Not authenticated" }, 401);
      const { data: profile } = await service
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      if (!["super_admin", "admin", "finance"].includes(profile?.role)) {
        return json({ error: "Insufficient permissions" }, 403);
      }
      triggeredBy = user.id;
    }

    // ── Insert run row up front ───────────────────────────────────────
    const { data: run } = await service
      .from("paystack_reconciliation_runs")
      .insert({ status: "running", triggered_by: triggeredBy })
      .select("id")
      .single();
    const runId = (run as any)?.id;

    try {
      const cutoff = new Date(Date.now() - STUCK_THRESHOLD_HOURS * 3600_000).toISOString();
      const { data: stuckItems, error: fetchErr } = await service
        .from("batch_items")
        .select("id, paystack_reference, full_name, status, batch_id")
        .in("status", ["pending", "retry"])
        .not("paystack_reference", "is", null)
        .lt("created_at", cutoff)
        .order("created_at", { ascending: true })
        .limit(MAX_ITEMS_PER_RUN);
      if (fetchErr) throw fetchErr;

      const items = (stuckItems || []) as any[];
      if (items.length === 0) {
        await service.from("paystack_reconciliation_runs").update({
          completed_at: new Date().toISOString(),
          items_checked: 0,
          status: "success",
          notes: "No stuck items.",
        }).eq("id", runId);
        return json({ ok: true, items_checked: 0, message: "No stuck items." });
      }

      const secret = await getPaystackSecret(service);
      let succeeded = 0;
      let failed = 0;
      let unchanged = 0;

      for (const it of items) {
        try {
          const res = await fetch(
            `${PAYSTACK_BASE}/transfer/verify/${encodeURIComponent(it.paystack_reference)}`,
            { headers: { Authorization: `Bearer ${secret}` } },
          );
          const body = await res.json();
          if (!res.ok || body?.status === false) {
            unchanged++;
            continue;
          }
          const status = body.data?.status as string | undefined;
          const reason = body.data?.failures?.[0]?.reason || body.data?.reason;

          if (status === "success") {
            await service.from("batch_items").update({
              status: "succeeded",
              failure_reason: null,
              processed_at: new Date().toISOString(),
              paystack_raw: body.data,
            }).eq("id", it.id);
            succeeded++;
          } else if (["failed", "reversed"].includes(status as string)) {
            await service.from("batch_items").update({
              status: "failed",
              failure_reason: reason || `Paystack ${status}`,
              processed_at: new Date().toISOString(),
              paystack_raw: body.data,
            }).eq("id", it.id);
            failed++;
          } else {
            // Still in flight on Paystack's side — leave alone.
            unchanged++;
          }
        } catch (e) {
          unchanged++;
          console.warn("[paystack-reconciliation] item failed:", it.id, e);
        }
      }

      // Recompute parent batch statuses for any batch we touched.
      const touchedBatches = new Set(items.map((i) => i.batch_id));
      for (const bid of touchedBatches) {
        const { data: rows } = await service
          .from("batch_items").select("status").eq("batch_id", bid);
        const all = (rows || []) as any[];
        if (all.length === 0) continue;
        const anyPending = all.some((r) => ["pending", "retry"].includes(r.status));
        const anyFailed = all.some((r) => r.status === "failed");
        const allOk = all.every((r) => r.status === "succeeded");
        const correct = anyPending
          ? "processing"
          : allOk
          ? "processed"
          : anyFailed
          ? "partially_processed"
          : "processing";
        await service.from("payment_batches").update({ status: correct }).eq("id", bid);
      }

      await service.from("paystack_reconciliation_runs").update({
        completed_at: new Date().toISOString(),
        items_checked: items.length,
        items_succeeded: succeeded,
        items_failed: failed,
        items_unchanged: unchanged,
        status: "success",
      }).eq("id", runId);

      return json({
        ok: true,
        items_checked: items.length,
        succeeded,
        failed,
        unchanged,
      });
    } catch (e: any) {
      await service.from("paystack_reconciliation_runs").update({
        completed_at: new Date().toISOString(),
        status: "failed",
        error_message: e?.message || String(e),
      }).eq("id", runId);
      throw e;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ ok: false, error: message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
