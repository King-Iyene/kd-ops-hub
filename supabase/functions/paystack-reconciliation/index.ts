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
      const secret = await getPaystackSecret(service);

      // ── Pass 1: resolve stuck items (pending/retry older than threshold) ──
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
            const feeKobo = Number(body.data?.fee) || 0;
            await service.from("batch_items").update({
              status: "succeeded",
              failure_reason: null,
              processed_at: new Date().toISOString(),
              paystack_raw: body.data,
              paystack_fee_ngn: feeKobo > 0 ? feeKobo / 100 : 0,
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
            unchanged++;
          }
        } catch (e) {
          unchanged++;
          console.warn("[paystack-reconciliation] item failed:", it.id, e);
        }
      }

      // Recompute parent batch statuses for any batch we touched.
      const touchedBatches = new Set(items.map((i: any) => i.batch_id));
      for (const bid of touchedBatches) {
        const { data: rows } = await service
          .from("batch_items").select("status").eq("batch_id", bid);
        const all = (rows || []) as any[];
        if (all.length === 0) continue;
        const anyPending = all.some((r: any) => ["pending", "retry"].includes(r.status));
        const anyFailed = all.some((r: any) => r.status === "failed");
        const allOk = all.every((r: any) => r.status === "succeeded");
        const correct = anyPending ? "processing"
          : allOk ? "processed"
          : anyFailed ? "partially_processed"
          : "processing";
        await service.from("payment_batches").update({ status: correct }).eq("id", bid);
      }

      // ── Pass 2: backfill fees for succeeded items that have fee = 0 ───────
      // Paystack's transfer.success webhook doesn't include the fee field,
      // so older rows have paystack_fee_ngn = 0. Fetch the fee from the
      // verify endpoint and fill it in so charge rows appear in Transactions.
      const { data: feeItems } = await service
        .from("batch_items")
        .select("id, paystack_reference")
        .eq("status", "succeeded")
        .eq("paystack_fee_ngn", 0)
        .not("paystack_reference", "is", null)
        .limit(200);

      let feesBackfilled = 0;
      for (const it of (feeItems || []) as any[]) {
        try {
          const res = await fetch(
            `${PAYSTACK_BASE}/transfer/verify/${encodeURIComponent(it.paystack_reference)}`,
            { headers: { Authorization: `Bearer ${secret}` } },
          );
          const body = await res.json();
          const feeKobo = Number(body.data?.fee) || 0;
          if (feeKobo > 0) {
            await service.from("batch_items")
              .update({ paystack_fee_ngn: feeKobo / 100 })
              .eq("id", it.id);
            feesBackfilled++;
          }
        } catch {
          // non-fatal
        }
      }
      console.log(`[reconciliation] fee backfill: ${feesBackfilled} items updated`);
      // ── End fee backfill ──────────────────────────────────────────────────

      await service.from("paystack_reconciliation_runs").update({
        completed_at: new Date().toISOString(),
        items_checked: items.length,
        items_succeeded: succeeded,
        items_failed: failed,
        items_unchanged: unchanged,
        status: "success",
        notes: items.length === 0 ? `No stuck items. Fees backfilled: ${feesBackfilled}` : null,
      }).eq("id", runId);

      return json({
        ok: true,
        items_checked: items.length,
        succeeded,
        failed,
        unchanged,
        fees_backfilled: feesBackfilled,
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
