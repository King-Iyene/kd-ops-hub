// supabase/functions/flutterwave-webhook/index.ts
//
// Flutterwave webhook receiver. Register this URL in BOTH the Test webhooks
// and Live webhooks tabs of your Flutterwave dashboard:
//   https://<project-ref>.supabase.co/functions/v1/flutterwave-webhook
//
// Deploy: supabase functions deploy flutterwave-webhook --no-verify-jwt
// Secrets required:
//   FLUTTERWAVE_WEBHOOK_HASH_TEST — matches the hash pasted in the Test tab
//   FLUTTERWAVE_WEBHOOK_HASH_LIVE — matches the hash pasted in the Live tab
//   FLUTTERWAVE_SECRET_KEY_TEST / _LIVE — for cross-verify (see below)
//
// Events handled:
//   transfer.completed       — normalise to transfer.success | .failed | .reversed
//                              based on data.status, then hand to
//                              process_flutterwave_webhook RPC (atomic).
//
// Why the cross-verify step:
//   Flutterwave's verif-hash is a STATIC shared secret (not an HMAC of the
//   body like Paystack). A leaked hash forges webhooks. To harden against
//   this, every event we accept via hash match is ALSO cross-verified by
//   calling GET /v3/transfers?reference=X and confirming the raw status
//   matches what the webhook claimed. If they disagree, we treat it as a
//   forgery attempt and reject.
//
// Atomic processing: the idempotency claim + batch_item update + batch recalc
// happen inside process_flutterwave_webhook (SECURITY DEFINER RPC). Contract
// matches process_paystack_webhook:
//   outcome=duplicate → 200 (Flutterwave doesn't retry)
//   outcome=no_match  → 200 (unrelated reference)
//   outcome=processed → 200 + best-effort notifications / email
//   any DB error      → 500 so Flutterwave retries

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { getCorsHeaders } from "../_shared/cors.ts";
import { constantTimeEquals } from "../_shared/timing.ts";

const FLUTTERWAVE_BASE = "https://api.flutterwave.com/v3";

// A hung cross-verify call would otherwise consume this function's entire
// execution budget with no visible failure — fail fast (the caller already
// treats a failed cross-verify as "untrusted" and safely 401s).
const FLUTTERWAVE_FETCH_TIMEOUT_MS = 30_000;

type Supabase = ReturnType<typeof createClient>;

// ─────────────────────────────────────────────────────────────────────────
// Signature verification — accept if the header matches EITHER the test or
// live hash. We try both because we can't know which mode a given event was
// dispatched from until we cross-verify against the API. In-band mode
// detection happens in fetchLiveStatus() below.
// ─────────────────────────────────────────────────────────────────────────
function verifyHash(headerHash: string): { valid: boolean; mode: "test" | "live" | null } {
  const testHash = Deno.env.get("FLUTTERWAVE_WEBHOOK_HASH_TEST") || "";
  const liveHash = Deno.env.get("FLUTTERWAVE_WEBHOOK_HASH_LIVE") || "";
  if (testHash && constantTimeEquals(headerHash, testHash)) {
    return { valid: true, mode: "test" };
  }
  if (liveHash && constantTimeEquals(headerHash, liveHash)) {
    return { valid: true, mode: "live" };
  }
  return { valid: false, mode: null };
}

// ─────────────────────────────────────────────────────────────────────────
// Cross-verify by calling Flutterwave's API. Uses the KEY matching the mode
// the hash suggested (test hash → test key; live hash → live key).
// ─────────────────────────────────────────────────────────────────────────
async function fetchLiveStatus(
  reference: string,
  mode: "test" | "live",
): Promise<{ status: string | null; fee_ngn: number; raw: any } | null> {
  const secret = mode === "live"
    ? Deno.env.get("FLUTTERWAVE_SECRET_KEY_LIVE")
    : Deno.env.get("FLUTTERWAVE_SECRET_KEY_TEST");
  if (!secret) {
    console.error(`[webhook] cross-verify: FLUTTERWAVE_SECRET_KEY_${mode.toUpperCase()} not set`);
    return null;
  }
  try {
    const res = await fetch(
      `${FLUTTERWAVE_BASE}/transfers?reference=${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(FLUTTERWAVE_FETCH_TIMEOUT_MS) },
    );
    if (!res.ok) {
      console.warn(`[webhook] cross-verify HTTP ${res.status} for ${reference}`);
      return null;
    }
    const body = await res.json();
    const t = Array.isArray(body?.data) ? body.data[0] : body?.data;
    if (!t) return null;
    return {
      status: t.status ? String(t.status).toLowerCase() : null,
      fee_ngn: Number(t.fee ?? 0) || 0,
      raw: t,
    };
  } catch (e) {
    console.warn("[webhook] cross-verify failed:", String(e));
    return null;
  }
}

async function notifyFinance(
  supabase: Supabase,
  type: string,
  title: string,
  body: string,
  priority: "normal" | "high" = "normal",
): Promise<void> {
  const { data: staff } = await supabase
    .from("profiles")
    .select("id")
    .in("role", ["super_admin", "admin", "finance"]);
  if (!staff || staff.length === 0) return;
  const rows = (staff as any[]).map((u) => ({
    user_id: u.id,
    type,
    module: "payments",
    priority,
    title,
    body,
  }));
  await supabase.from("notifications").insert(rows);
}

async function audit(
  supabase: Supabase,
  actionType: string,
  description: string,
): Promise<void> {
  await supabase.from("audit_logs").insert({
    action_type: actionType,
    description,
    performed_by_name: "Flutterwave Webhook",
  });
}

async function alertWalletDesync(
  supabase: Supabase,
  op: "debit" | "refund",
  scope: "company_disbursement",
  reference: string,
  detail: string,
): Promise<void> {
  const description =
    `Wallet ${op} failed for ${scope} (ref ${reference}): ${detail}. ` +
    `The Flutterwave transfer already resolved — the wallet balance may now ` +
    `be out of sync and needs manual reconciliation.`;
  await audit(supabase, "principal_wallet_desync", description);
  await notifyFinance(
    supabase,
    "wallet_desync",
    `Wallet ${op} failed — balance may be out of sync`,
    description,
    "high",
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const rawBody = await req.text();
  const headerHash = req.headers.get("verif-hash") ?? "";

  const { valid, mode } = verifyHash(headerHash);
  if (!valid || !mode) {
    console.warn("[webhook] Invalid verif-hash");
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Flutterwave transfer payload shape:
  //   { event: "transfer.completed", "event.type": "Transfer",
  //     data: { id, reference, status, amount, fee, complete_message, ... } }
  const event = payload?.event as string | undefined;
  const data = payload?.data;
  if (!event || !data) {
    return new Response("Missing event or data", { status: 400 });
  }

  // Only process transfer events. Charge events (subscriptions, cards, etc.)
  // are ignored — this account may receive them but they're unrelated.
  if (!event.startsWith("transfer.")) {
    return new Response("ok (ignored non-transfer)", { status: 200, headers: corsHeaders });
  }

  const reference = data.reference as string | undefined;
  if (!reference) {
    console.warn("[webhook] No reference in event:", event);
    return new Response("ok (no reference)", { status: 200, headers: corsHeaders });
  }

  // ────────────────────────────────────────────────────────────────
  // Cross-verify: fetch live status from Flutterwave API and confirm
  // the webhook's claimed status matches. This is the defence against
  // a leaked verif-hash forging fake success events.
  // ────────────────────────────────────────────────────────────────
  const live = await fetchLiveStatus(reference, mode);
  if (!live) {
    console.warn("[webhook] cross-verify unavailable; treating as untrusted");
    return new Response("Cross-verify failed", { status: 401 });
  }
  const webhookStatus = String(data.status || "").toLowerCase();
  if (live.status && webhookStatus && live.status !== webhookStatus) {
    console.warn(
      `[webhook] cross-verify MISMATCH ref=${reference} webhook_status=${webhookStatus} live_status=${live.status}`,
    );
    return new Response("Signature/status mismatch", { status: 401 });
  }
  // From this point on, we use LIVE data as the source of truth — the webhook
  // just told us "hey look at this ref". Its status/fee are re-derived below.

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Normalise FW status → one of our three canonical webhook events, matching
  // process_paystack_webhook's contract exactly.
  const s = live.status || webhookStatus;
  let normalised: "transfer.success" | "transfer.failed" | "transfer.reversed";
  if (s === "successful" || s === "success") normalised = "transfer.success";
  else if (s === "failed") normalised = "transfer.failed";
  else if (s === "reversed") normalised = "transfer.reversed";
  else {
    // pending / new / processing — no terminal state yet. Return 200 so FW
    // doesn't retry pointlessly; reconciliation will pick it up later.
    return new Response(`ok (non-terminal: ${s})`, { status: 200, headers: corsHeaders });
  }

  const failureReason =
    normalised === "transfer.failed"
      ? (live.raw?.complete_message || data.complete_message || live.raw?.reason || "Transfer failed")
      : normalised === "transfer.reversed"
      ? "Transfer reversed by Flutterwave"
      : null;

  const feeNgn = normalised === "transfer.success" ? live.fee_ngn : 0;
  const now = new Date().toISOString();

  const { data: rpcData, error: rpcErr } = await supabase.rpc(
    "process_flutterwave_webhook",
    {
      p_event: normalised,
      p_reference: reference,
      p_failure_reason: failureReason,
      p_flutterwave_raw: live.raw,
      p_flutterwave_fee_ngn: feeNgn,
      p_processed_at: now,
    },
  );

  if (rpcErr) {
    console.error("[webhook] process_flutterwave_webhook failed:", rpcErr.message, {
      reference,
      normalised,
    });
    return new Response(
      JSON.stringify({ error: "DB error — please retry", reference, event: normalised }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const outcome = (rpcData as any)?.outcome as "duplicate" | "no_match" | "processed" | undefined;

  if (outcome === "duplicate") {
    console.info("[webhook] Duplicate delivery — skipping:", normalised, reference);
    return new Response("ok (duplicate)", { status: 200, headers: corsHeaders });
  }
  if (outcome === "no_match") {
    console.info("[webhook] No batch_item for reference:", reference);
    return new Response("ok (no_match)", { status: 200, headers: corsHeaders });
  }

  // outcome === 'processed'
  const item = {
    id: (rpcData as any).item_id,
    batch_id: (rpcData as any).batch_id,
    full_name: (rpcData as any).full_name,
    account_name: (rpcData as any).account_name,
    amount_ngn: (rpcData as any).amount_ngn,
  };

  // Best-effort notifications + audit. Failures here MUST NOT cause a 500.
  try {
    if (normalised === "transfer.success") {
      await audit(
        supabase,
        "flutterwave_transfer_succeeded",
        `Webhook: transfer succeeded for ${item.full_name} (ref ${reference})`,
      );
      await notifyFinance(
        supabase,
        "transfer_success",
        `Payment to ${item.full_name} succeeded`,
        `Flutterwave ref: ${reference}`,
      );
    } else if (normalised === "transfer.failed") {
      await audit(
        supabase,
        "flutterwave_transfer_failed",
        `Webhook: transfer failed for ${item.full_name} — ${failureReason} (ref ${reference})`,
      );
      await notifyFinance(
        supabase,
        "transfer_failed",
        `Payment to ${item.full_name} failed`,
        failureReason || "Transfer failed",
        "high",
      );
    } else if (normalised === "transfer.reversed") {
      await audit(
        supabase,
        "flutterwave_transfer_reversed",
        `Webhook: transfer reversed for ${item.full_name} (ref ${reference})`,
      );
      await notifyFinance(
        supabase,
        "transfer_reversed",
        `Payment to ${item.full_name} was reversed`,
        `Flutterwave ref: ${reference}`,
        "high",
      );
    }
  } catch (e) {
    console.warn("[webhook] post-txn side-effect failed (non-fatal):", e);
  }

  // Principal Disbursements wallet — only Company Disbursement batches (the
  // 3 director-only payment_category values) touch the wallet; ordinary
  // payroll/vendor/contractor batch_items never do. Debit on confirmed
  // success; credit back on a later reversal. Best-effort — the real
  // Flutterwave transfer has already resolved regardless. Mirrors
  // paystack-webhook's identical block exactly — Personal Transfers have no
  // Flutterwave path today (no flutterwave_reference column, no dispatch
  // code in flutterwave-transfer), so unlike paystack-webhook there is no
  // separate personal_transfers branch to replicate here.
  if (normalised === "transfer.success" || normalised === "transfer.reversed") {
    try {
      const { data: isDirectorBatch } = await supabase.rpc("is_director_disbursement_batch", {
        p_batch_id: item.batch_id,
      });
      if (isDirectorBatch) {
        if (normalised === "transfer.success") {
          const { error: debitErr } = await supabase.rpc("debit_principal_wallet", {
            p_amount_ngn: item.amount_ngn,
            p_source: "company_disbursement",
            p_reference: reference,
            p_related_batch_item_id: item.id,
            p_related_personal_transfer_id: null,
          });
          if (debitErr) {
            console.warn("[webhook] wallet debit failed (company_disbursement):", debitErr.message, reference);
            await alertWalletDesync(supabase, "debit", "company_disbursement", reference, debitErr.message);
          }
        } else {
          const { error: refundErr } = await supabase.rpc("credit_back_principal_wallet", {
            p_amount_ngn: item.amount_ngn,
            p_reference: reference,
          });
          if (refundErr) {
            console.warn("[webhook] wallet refund failed (company_disbursement):", refundErr.message, reference);
            await alertWalletDesync(supabase, "refund", "company_disbursement", reference, refundErr.message);
          }
        }
      }
    } catch (e) {
      console.warn("[webhook] wallet effect threw (company_disbursement):", e, reference);
      await alertWalletDesync(
        supabase,
        normalised === "transfer.success" ? "debit" : "refund",
        "company_disbursement",
        reference,
        String(e),
      );
    }
  }

  // ------------------------------------------------------------------
  // Sync payment_status on any linked expense (expense reimbursement flow).
  // Runs after batch recalc so the batch is already settled first. For
  // expenses linked to a fuel_request we also propagate the state to the
  // fuel_request row so Fleet's status matches reality without a manual
  // "Mark Payment Sent" click. Mirrors paystack-webhook's identical block —
  // without this, an expense/fuel reimbursement paid via Flutterwave never
  // leaves payment_status='pending', which left it eligible for a second
  // real batch dispatch through create_expense_payment_batch.
  // ------------------------------------------------------------------
  const { data: linkedExpense, error: expLookupErr } = await supabase
    .from("expenses")
    .select("id, submitted_by, amount_ngn, fuel_request_id")
    .eq("payment_reference", item.batch_id)
    .maybeSingle();

  if (expLookupErr) {
    console.error("[webhook] expense lookup error:", expLookupErr.message);
  }

  if (linkedExpense) {
    const fuelRequestId = (linkedExpense as any).fuel_request_id as string | null;

    if (normalised === "transfer.success") {
      await supabase
        .from("expenses")
        .update({ payment_status: "processed", processed_at: now })
        .eq("id", linkedExpense.id);

      await supabase.from("notifications").insert({
        user_id: linkedExpense.submitted_by,
        type: "expense_paid",
        module: "expenses",
        priority: "normal",
        title: "Expense Reimbursement Processed",
        body: `Your expense of ₦${Number(linkedExpense.amount_ngn).toLocaleString()} has been paid.`,
      });

      if (fuelRequestId) {
        await supabase
          .from("fuel_requests")
          .update({ status: "payment_sent", payment_sent_at: now })
          .eq("id", fuelRequestId)
          .in("status", ["pending", "approved"]);

        await supabase.from("notifications").insert({
          user_id: linkedExpense.submitted_by,
          type: "fuel_payment_sent",
          module: "fleet",
          priority: "normal",
          title: "Fuel payment sent",
          body: `₦${Number(linkedExpense.amount_ngn).toLocaleString()} has been sent. Please upload your receipt.`,
        });
      }
    } else if (normalised === "transfer.failed" || normalised === "transfer.reversed") {
      await supabase
        .from("expenses")
        .update({ payment_status: "failed" })
        .eq("id", linkedExpense.id);

      await supabase.from("notifications").insert({
        user_id: linkedExpense.submitted_by,
        type: "expense_payment_failed",
        module: "expenses",
        priority: "high",
        title: "Expense Payment Failed",
        body: `Payment of ₦${Number(linkedExpense.amount_ngn).toLocaleString()} could not be processed. Please contact Finance.`,
      });

      if (fuelRequestId) {
        await supabase
          .from("fuel_requests")
          .update({ status: "approved" })
          .eq("id", fuelRequestId)
          .eq("status", "payment_sent");
      }
    }
  }

  return new Response("ok", { status: 200, headers: corsHeaders });
});
