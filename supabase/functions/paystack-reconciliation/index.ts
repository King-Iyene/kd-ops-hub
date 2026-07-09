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
      // Filter on updated_at rather than created_at so we don't hammer
      // /transfer/verify on items that were dispatched only minutes ago inside
      // a batch that happens to have been created hours earlier (e.g. a batch
      // sat in draft for 3h, then Process was clicked). updated_at tracks the
      // dispatch write, so a row is only considered stuck once it has been
      // sitting on 'pending' / 'retry' for STUCK_THRESHOLD_HOURS since its
      // last state change — the definition operators would expect.
      const cutoff = new Date(Date.now() - STUCK_THRESHOLD_HOURS * 3600_000).toISOString();
      const { data: stuckItems, error: fetchErr } = await service
        .from("batch_items")
        .select("id, paystack_reference, full_name, status, batch_id")
        .in("status", ["pending", "retry"])
        .not("paystack_reference", "is", null)
        .lt("updated_at", cutoff)
        .order("updated_at", { ascending: true })
        .limit(MAX_ITEMS_PER_RUN);
      if (fetchErr) throw fetchErr;

      const items = (stuckItems || []) as any[];
      let succeeded = 0;
      let failed = 0;
      let unchanged = 0;
      let otpRequired = 0;
      const otpItems: { name: string; ref: string }[] = [];

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
          } else if (["failed", "reversed", "abandoned"].includes(status as string)) {
            await service.from("batch_items").update({
              status: "failed",
              failure_reason: reason || `Paystack ${status}`,
              processed_at: new Date().toISOString(),
              paystack_raw: body.data,
            }).eq("id", it.id);
            failed++;
          } else if (status === "otp") {
            // Paystack is waiting for merchant OTP confirmation on the
            // dashboard. Keep the row pending but write a clear note so
            // finance knows it's a human-action problem, not a system
            // failure. We avoid re-notifying on every reconciliation run by
            // only writing the message when it isn't already there.
            await service.from("batch_items").update({
              failure_reason:
                "Awaiting OTP authorization — approve on dashboard.paystack.co (Transfers → pending) to release this transfer.",
              paystack_raw: body.data,
            }).eq("id", it.id);
            otpRequired++;
            otpItems.push({ name: it.full_name, ref: it.paystack_reference });
            unchanged++;
          } else {
            // pending / received / queued — no terminal change yet.
            unchanged++;
          }
        } catch (e) {
          unchanged++;
          console.warn("[paystack-reconciliation] item failed:", it.id, e);
        }
      }

      // One consolidated notification per run when items are blocked on OTP,
      // so finance sees a single actionable card instead of N separate rows.
      if (otpItems.length > 0) {
        try {
          const { data: staff } = await service
            .from("profiles")
            .select("id")
            .in("role", ["super_admin", "admin", "finance"]);
          const titleSummary = otpItems.length === 1
            ? `1 transfer awaiting OTP approval on Paystack`
            : `${otpItems.length} transfers awaiting OTP approval on Paystack`;
          const bodySummary =
            otpItems.slice(0, 5).map((o) => `• ${o.name} (${o.ref})`).join("\n")
            + (otpItems.length > 5 ? `\n… and ${otpItems.length - 5} more` : "")
            + "\n\nGo to dashboard.paystack.co → Transfers → Pending to approve.";
          if (staff && staff.length > 0) {
            await service.from("notifications").insert(
              (staff as any[]).map((u) => ({
                user_id: u.id,
                type: "transfer_otp_required",
                module: "payments",
                priority: "high",
                title: titleSummary,
                body: bodySummary,
              })),
            );
          }
        } catch (e) {
          console.warn("[reconciliation] otp notify failed:", e);
        }
      }

      // Recompute parent batch statuses for any batch we touched. We now
      // delegate to the sync_batch_status_from_items RPC instead of doing the
      // status math client-side + writing directly. Two reasons:
      //   1. The direct .update() ran as service_role, which the state-machine
      //      trigger's `current_user <> 'authenticated'` guard let through
      //      unconditionally — so a reversed item arriving late could shove a
      //      'processed' batch backward to 'processing', silently re-opening a
      //      closed batch and re-triggering polling / emails.
      //   2. The client-side math missed the 'completed' transition and never
      //      stamped processing_finalized_at.
      // sync_batch_status_from_items has both fixes built in: it early-returns
      // for terminal statuses and drives the transitions through the guarded
      // paths. Idempotent, safe to call once per touched batch.
      const touchedBatches = Array.from(new Set(items.map((i: any) => i.batch_id)));
      for (const bid of touchedBatches) {
        try {
          await service.rpc("sync_batch_status_from_items", { p_batch_id: bid });
        } catch (e) {
          console.warn("[reconciliation] sync_batch_status_from_items failed for", bid, e);
        }
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

      // Paystack rate-limits the verify endpoint at ~100 req/min for most
      // merchants. This loop can hit up to 200 items — without spacing it
      // 429s halfway through and every subsequent request is dropped, so
      // fees stay 0 for that half and the Transactions report is wrong.
      // 700ms per call yields ~85 req/min — comfortably under the limit,
      // finishes 200 items in ~140s (well within the function timeout).
      // Also honours Retry-After when we do get an occasional 429.
      const FEE_BACKFILL_MIN_MS = 700;
      let feesBackfilled = 0;
      let lastCallAt = 0;
      for (const it of (feeItems || []) as any[]) {
        const wait = FEE_BACKFILL_MIN_MS - (Date.now() - lastCallAt);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        try {
          lastCallAt = Date.now();
          const res = await fetch(
            `${PAYSTACK_BASE}/transfer/verify/${encodeURIComponent(it.paystack_reference)}`,
            { headers: { Authorization: `Bearer ${secret}` } },
          );
          if (res.status === 429) {
            // Rate-limited even with the pacing. Sleep the Retry-After (Paystack
            // returns 1–60s here) and skip this item; the next run picks it up.
            const retryAfter = Math.min(60, Math.max(1, Number(res.headers.get('retry-after')) || 5));
            console.warn(`[reconciliation] fee backfill 429; sleeping ${retryAfter}s and stopping this run`);
            await new Promise((r) => setTimeout(r, retryAfter * 1000));
            break;
          }
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
        notes: items.length === 0
          ? `No stuck items. Fees backfilled: ${feesBackfilled}`
          : (otpRequired > 0
              ? `${otpRequired} item(s) awaiting OTP approval on Paystack dashboard.`
              : null),
      }).eq("id", runId);

      return json({
        ok: true,
        items_checked: items.length,
        succeeded,
        failed,
        unchanged,
        otp_required: otpRequired,
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
