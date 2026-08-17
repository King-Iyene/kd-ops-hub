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
import { timingSafeEqual } from "https://deno.land/std@0.224.0/crypto/timing_safe_equal.ts";

const FLUTTERWAVE_BASE = "https://api.flutterwave.com/v3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, verif-hash",
};

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
  const enc = new TextEncoder();
  if (testHash && headerHash.length === testHash.length) {
    if (timingSafeEqual(enc.encode(headerHash), enc.encode(testHash))) {
      return { valid: true, mode: "test" };
    }
  }
  if (liveHash && headerHash.length === liveHash.length) {
    if (timingSafeEqual(enc.encode(headerHash), enc.encode(liveHash))) {
      return { valid: true, mode: "live" };
    }
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
      { headers: { Authorization: `Bearer ${secret}` } },
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

// ─────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
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

  return new Response("ok", { status: 200, headers: corsHeaders });
});
