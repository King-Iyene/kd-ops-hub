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
// Atomic processing (H-8): the idempotency claim and the batch_item update
// happen inside a single SECURITY DEFINER RPC `process_paystack_webhook` so
// they succeed or fail together. The webhook then handles the outcome:
//   outcome=duplicate → 200 (don't retry)
//   outcome=no_match  → 200 (unrelated reference)
//   outcome=processed → 200 + run notifications/email outside the txn
//   any DB error      → 500 so Paystack retries
//
// Notifications and the recipient email are best-effort and run AFTER the
// transactional RPC returns, so a notification failure doesn't roll back the
// payment-state update or trigger a Paystack retry.

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
    performed_by_name: "Paystack Webhook",
  });
}

/**
 * Resolve recipient email + name for a batch_item and dispatch the templated
 * 'payment.completed' email. Tries the employee profile first, then the
 * contractor row. Silent on any failure — email is informational only.
 */
async function sendRecipientPaymentEmail(
  supabase: Supabase,
  item: any,
  reference: string,
  sentAtIso: string,
): Promise<void> {
  try {
    let recipientEmail: string | null = null;
    let recipientName: string = item.full_name || "there";

    if (item.employee_id) {
      const { data } = await supabase
        .from("profiles")
        .select("email, full_name")
        .eq("id", item.employee_id)
        .maybeSingle();
      if (data) {
        recipientEmail = (data as any).email ?? null;
        recipientName = (data as any).full_name || recipientName;
      }
    }
    if (!recipientEmail && item.contractor_id) {
      const { data } = await supabase
        .from("contractors")
        .select("email, full_name")
        .eq("id", item.contractor_id)
        .maybeSingle();
      if (data) {
        recipientEmail = (data as any).email ?? null;
        recipientName = (data as any).full_name || recipientName;
      }
    }
    if (!recipientEmail) return;

    const acct = String(item.account_number || "");
    const last4 = acct.length >= 4 ? acct.slice(-4) : acct;
    const formattedAmount = `₦${Number(item.amount_ngn || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Call our own send-email edge fn for the templated channel. Use
    // service-role auth so the fn doesn't need a user JWT for this server-
    // initiated send.
    await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          channel: "templated",
          template_key: "payment.completed",
          to: recipientEmail,
          vars: {
            recipient_name: recipientName,
            amount: formattedAmount,
            account_last4: last4,
            bank_name: item.bank_name || "your bank",
            reference,
            sent_at: new Date(sentAtIso).toLocaleString(),
            company_name: "KD Squares",
          },
        }),
      },
    );
  } catch (e) {
    console.warn("[webhook] payment.completed email failed:", e);
  }
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
  // H-8: For transfer.success, fetch the fee BEFORE the atomic RPC so
  // we can pass it in the same DB transaction.
  // ------------------------------------------------------------------
  let feeNgn = 0;
  if (event === "transfer.success") {
    try {
      const secret = await getPaystackSecret();
      if (secret) {
        const feeRes = await fetch(
          `https://api.paystack.co/transfer/verify/${encodeURIComponent(reference)}`,
          { headers: { Authorization: `Bearer ${secret}` } },
        );
        const feeBody = await feeRes.json();
        const feeKobo = Number(feeBody.data?.fee) || 0;
        feeNgn = feeKobo > 0 ? feeKobo / 100 : 0;
      }
    } catch (feeErr) {
      console.warn("[webhook] Could not fetch transfer fee:", feeErr);
    }
  }

  const now = new Date().toISOString();

  // Pre-compute the failure reason (used for failed/reversed events).
  const failureReason =
    event === "transfer.failed"
      ? data.gateway_response ||
        data.message ||
        data.failures?.[0]?.reason ||
        "Transfer failed"
      : event === "transfer.reversed"
      ? "Transfer reversed by Paystack"
      : null;

  // ------------------------------------------------------------------
  // H-8: Atomic processing — idempotency + batch_item update + batch
  // recalc all happen in ONE transaction inside a SECURITY DEFINER RPC.
  // On any DB error we return 500 so Paystack retries; on duplicate we
  // return 200 so it doesn't.
  // ------------------------------------------------------------------
  const { data: rpcData, error: rpcErr } = await supabase.rpc(
    "process_paystack_webhook",
    {
      p_event: event,
      p_reference: reference,
      p_failure_reason: failureReason,
      p_paystack_raw: data,
      p_paystack_fee_ngn: feeNgn,
      p_processed_at: now,
    },
  );

  if (rpcErr) {
    console.error("[webhook] process_paystack_webhook failed:", rpcErr.message, {
      reference,
      event,
    });
    return new Response(
      JSON.stringify({ error: "DB error — please retry", reference, event }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const outcome = (rpcData as any)?.outcome as
    | "duplicate"
    | "no_match"
    | "processed"
    | undefined;

  if (outcome === "duplicate") {
    console.info("[webhook] Duplicate delivery — skipping:", event, reference);
    return new Response("ok (duplicate)", { status: 200, headers: corsHeaders });
  }
  if (outcome === "no_match") {
    console.info("[webhook] No batch_item for reference:", reference);
    return new Response("ok (no_match)", { status: 200, headers: corsHeaders });
  }

  // outcome === 'processed' — the transactional update succeeded.
  const item = {
    id: (rpcData as any).item_id,
    batch_id: (rpcData as any).batch_id,
    full_name: (rpcData as any).full_name,
    account_number: (rpcData as any).account_number,
    bank_name: (rpcData as any).bank_name,
    amount_ngn: (rpcData as any).amount_ngn,
    employee_id: (rpcData as any).employee_id,
    contractor_id: (rpcData as any).contractor_id,
  };

  // ------------------------------------------------------------------
  // Step 2 (post-txn): notifications, audit, email — best effort.
  // Failures here MUST NOT cause a 500 because the transactional state
  // is already committed and Paystack would retry pointlessly.
  // ------------------------------------------------------------------

  if (event === "transfer.success") {
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

    // Best-effort templated email to the recipient (employee or contractor).
    // The send-email edge fn loads the template, so any subject/body changes
    // in Settings → Email Templates take effect immediately without redeploys.
    void sendRecipientPaymentEmail(supabase, item, reference, now);

  } else if (event === "transfer.failed") {
    const reason = failureReason ?? "Transfer failed";
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
  // Step 4: Sync payment_status on any linked expense (expense reimbursement
  // flow). Runs after batch recalc so the batch is already settled first.
  // For expenses linked to a fuel_request we also propagate the state to
  // the fuel_request row so Fleet's status matches reality without a
  // manual "Mark Payment Sent" click.
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

      // Fuel-linked expense: flip the fuel_request to 'payment_sent' so the
      // employee sees the "Upload Receipt" prompt automatically. Skip if it
      // has already moved past payment_sent (e.g. receipt uploaded, completed)
      // to avoid clobbering a more advanced state on a late retry.
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

      // Roll the fuel_request back to 'approved' so admin can retry without
      // the request being stuck mid-flow.
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
