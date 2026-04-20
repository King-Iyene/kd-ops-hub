// supabase/functions/paystack-webhook/index.ts
//
// Paystack webhook receiver. Register this URL in your Paystack dashboard:
//   https://<project-ref>.supabase.co/functions/v1/paystack-webhook
//
// Deploy: supabase functions deploy paystack-webhook --no-verify-jwt
// Set secret: supabase secrets set PAYSTACK_SECRET_KEY=sk_live_...
//
// Events handled:
//   transfer.success  — mark batch_item succeeded, recalc batch, sync expense
//   transfer.failed   — mark batch_item failed with reason, recalc batch, sync expense
//   transfer.reversed — mark batch_item reversed, recalc batch, sync expense
//
// Operation order per event (must not change):
//   1. Update batch_item status + paystack_raw
//   2. Recalculate parent payment_batches.status
//   3. Sync linked expense.payment_status (if any)
//   4. Insert notifications
//
// Error policy: always return 200 OK — throwing causes Paystack to retry
// indefinitely. Log errors via console.error instead.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { createHmac } from "https://deno.land/std@0.177.0/node/crypto.ts";
import { timingSafeEqual } from "https://deno.land/std@0.177.0/crypto/timing_safe_equal.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-paystack-signature",
};

type Supabase = ReturnType<typeof createClient>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getPaystackSecret(): Promise<string | null> {
  const envSecret = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (envSecret) return envSecret;

  try {
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data } = await serviceClient
      .from("company_settings")
      .select("paystack_secret_key_enc")
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .maybeSingle();
    return (data as any)?.paystack_secret_key_enc || null;
  } catch {
    return null;
  }
}

async function verifySignature(body: string, signature: string): Promise<boolean> {
  const secret = await getPaystackSecret();
  if (!secret) {
    console.error("[webhook] No PAYSTACK_SECRET_KEY in env or company_settings");
    return false;
  }
  const hash = createHmac("sha512", secret).update(body).digest("hex");
  const enc = new TextEncoder();
  const isValid = timingSafeEqual(enc.encode(hash), enc.encode(signature));
  if (!isValid) return false;
  return true;
}

/**
 * Recalculate the parent batch status from current item statuses.
 *
 * Terminal statuses:  succeeded | failed | reversed
 * Non-terminal:       pending   | retry
 *
 * Rules (evaluated in order):
 *   all succeeded                     → processed
 *   all terminal, at least one bad    → partially_processed
 *   some still in-flight              → processing
 */
async function recalculateBatchStatus(
  batchId: string,
  supabase: Supabase,
): Promise<void> {
  const { data: items, error } = await supabase
    .from("batch_items")
    .select("status")
    .eq("batch_id", batchId);

  if (error) {
    console.error("[webhook] recalculate fetch error:", error.message);
    return;
  }
  if (!items || items.length === 0) return;

  const TERMINAL = new Set(["succeeded", "failed", "reversed"]);
  const allSucceeded = items.every((i: any) => i.status === "succeeded");
  const allComplete = items.every((i: any) => TERMINAL.has(i.status));
  const anyBad = items.some(
    (i: any) => i.status === "failed" || i.status === "reversed",
  );

  const batchStatus = allSucceeded
    ? "processed"
    : allComplete
    ? "partially_processed"
    : anyBad
    ? "partially_processed"
    : "processing";

  const { error: batchErr } = await supabase
    .from("payment_batches")
    .update({ status: batchStatus })
    .eq("id", batchId);

  if (batchErr) {
    console.error("[webhook] batch status update error:", batchErr.message);
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

  if (!staff) return;
  for (const u of staff as any[]) {
    await supabase.from("notifications").insert({
      user_id: u.id,
      type,
      module: "payments",
      priority,
      title,
      body,
    });
  }
}

async function audit(
  supabase: Supabase,
  actionType: string,
  description: string,
): Promise<void> {
  await supabase.from("audit_logs").insert({
    action_type: actionType,
    description,
    performed_by_name: "Paystack Webhook",
  });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature") ?? "";

  if (!(await verifySignature(rawBody, signature))) {
    console.warn("[webhook] Invalid HMAC signature");
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const event = payload?.event as string | undefined;
  const data = payload?.data;

  if (!event || !data) {
    return new Response("Missing event or data", { status: 400 });
  }

  // Only process transfer events — ignore charge.success, refund.*, etc.
  if (!event.startsWith("transfer.")) {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const reference = data.reference as string | undefined;
  if (!reference) {
    console.warn("[webhook] No reference in event:", event);
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  // ------------------------------------------------------------------
  // Step 1: Look up the batch_item by paystack_reference.
  // ------------------------------------------------------------------
  const { data: item, error: lookupErr } = await supabase
    .from("batch_items")
    .select("id, full_name, batch_id")
    .eq("paystack_reference", reference)
    .maybeSingle();

  if (lookupErr) {
    console.error("[webhook] batch_item lookup error:", lookupErr.message);
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (!item) {
    // Reference not in our DB — unrelated Paystack account transfer, ignore.
    console.info("[webhook] No batch_item for reference:", reference);
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  const now = new Date().toISOString();

  // ------------------------------------------------------------------
  // Step 2: Update batch_item and log audit.
  // ------------------------------------------------------------------

  if (event === "transfer.success") {
    const { error: updateErr } = await supabase
      .from("batch_items")
      .update({
        status: "succeeded",
        failure_reason: null,
        processed_at: now,
        paystack_raw: data,
      })
      .eq("id", item.id);

    if (updateErr) {
      console.error("[webhook] batch_item update (success) failed:", updateErr.message);
    }

    await audit(
      supabase,
      "paystack_transfer_succeeded",
      `Webhook: transfer succeeded for ${item.full_name} (ref ${reference})`,
    );

    await notifyFinance(
      supabase,
      "transfer_success",
      `Payment to ${item.full_name} succeeded`,
      `Paystack ref: ${reference}`,
    );

  } else if (event === "transfer.failed") {
    // Prefer gateway_response (human-readable), fall back to other fields.
    const reason =
      data.gateway_response ||
      data.message ||
      data.failures?.[0]?.reason ||
      "Transfer failed";

    const { error: updateErr } = await supabase
      .from("batch_items")
      .update({
        status: "failed",
        failure_reason: reason,
        processed_at: now,
        paystack_raw: data,
      })
      .eq("id", item.id);

    if (updateErr) {
      console.error("[webhook] batch_item update (failed) error:", updateErr.message);
    }

    await audit(
      supabase,
      "paystack_transfer_failed",
      `Webhook: transfer failed for ${item.full_name} — ${reason} (ref ${reference})`,
    );

    await notifyFinance(
      supabase,
      "transfer_failed",
      `Payment to ${item.full_name} failed`,
      reason,
      "high",
    );

  } else if (event === "transfer.reversed") {
    const { error: updateErr } = await supabase
      .from("batch_items")
      .update({
        status: "reversed",
        failure_reason: "Transfer reversed by Paystack",
        processed_at: now,
        paystack_raw: data,
      })
      .eq("id", item.id);

    if (updateErr) {
      console.error("[webhook] batch_item update (reversed) error:", updateErr.message);
    }

    await audit(
      supabase,
      "paystack_transfer_reversed",
      `Webhook: transfer reversed for ${item.full_name} (ref ${reference})`,
    );

    await notifyFinance(
      supabase,
      "transfer_reversed",
      `Payment to ${item.full_name} was reversed`,
      `Paystack ref: ${reference}`,
      "high",
    );
  }

  // ------------------------------------------------------------------
  // Step 3: Recalculate parent batch status from all item statuses.
  // ------------------------------------------------------------------
  await recalculateBatchStatus(item.batch_id, supabase);

  // ------------------------------------------------------------------
  // Step 4: Sync payment_status on any linked expense (expense reimbursement
  // flow). Runs after batch recalc so the batch is already settled first.
  // ------------------------------------------------------------------
  const { data: linkedExpense, error: expLookupErr } = await supabase
    .from("expenses")
    .select("id, submitted_by, amount_ngn")
    .eq("payment_reference", item.batch_id)
    .maybeSingle();

  if (expLookupErr) {
    console.error("[webhook] expense lookup error:", expLookupErr.message);
  }

  if (linkedExpense) {
    if (event === "transfer.success") {
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
    } else if (event === "transfer.failed" || event === "transfer.reversed") {
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
    }
  }

  return new Response("ok", { status: 200, headers: corsHeaders });
});
