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
//   charge.success (dedicated_nuban) — credit the Principal Disbursements
//     wallet when the registered DVA (principal_wallet_dva) receives funds
//   transfer.success/reversed for a director-only batch_item or a
//     personal_transfers row — debit/credit-back the same wallet
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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { createHmac } from "https://deno.land/std@0.224.0/node/crypto.ts";
import { timingSafeEqual } from "https://deno.land/std@0.224.0/crypto/timing_safe_equal.ts";

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
  try {
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data } = await serviceClient
      .from("company_settings")
      .select("paystack_mode, paystack_secret_key_enc")
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .maybeSingle();
    const mode = ((data as any)?.paystack_mode || "live") as "test" | "live";

    // Mode-specific env vars first, then legacy fallback, then DB.
    const envName = mode === "live"
      ? "PAYSTACK_SECRET_KEY_LIVE"
      : "PAYSTACK_SECRET_KEY_TEST";
    const secret = Deno.env.get(envName)
      ?? Deno.env.get("PAYSTACK_SECRET_KEY")
      ?? (data as any)?.paystack_secret_key_enc
      ?? null;
    return secret;
  } catch {
    return Deno.env.get("PAYSTACK_SECRET_KEY") ?? null;
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
 * A wallet debit/refund RPC failing here means the Paystack transfer has
 * already resolved (success/reversed) but the Principal Disbursements
 * wallet balance did NOT move to match — a real desync, not a cosmetic
 * error. Previously this was only console.warn'd, which is invisible
 * outside a live log tail. Record it the same durable way every other
 * payment-state event in this file is recorded (audit_logs + a high-
 * priority finance notification) so it surfaces in the UI and can be
 * reconciled, instead of silently drifting the wallet balance.
 */
async function alertWalletDesync(
  supabase: Supabase,
  op: "debit" | "refund",
  scope: "personal_transfer" | "company_disbursement",
  reference: string,
  detail: string,
): Promise<void> {
  const description =
    `Wallet ${op} failed for ${scope} (ref ${reference}): ${detail}. ` +
    `The Paystack transfer already resolved — the wallet balance may now ` +
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
    // Read the audience preference up front. Hot-toggleable from
    // Settings → Notifications without redeploying this function.
    // Falls back to 'all' on any failure so a settings hiccup never
    // silently breaks payment notifications.
    let audience: 'all' | 'employees_only' | 'contractors_only' | 'none' = 'all';
    try {
      const { data: settings } = await supabase
        .from('company_settings')
        .select('payment_email_audience')
        .eq('id', '00000000-0000-0000-0000-000000000001')
        .maybeSingle();
      const v = (settings as any)?.payment_email_audience;
      if (v === 'employees_only' || v === 'contractors_only' || v === 'none') audience = v;
    } catch (_e) { /* keep default */ }
    if (audience === 'none') return;

    const targetIsEmployee   = !!item.employee_id;
    const targetIsContractor = !!item.contractor_id && !item.employee_id;
    if (audience === 'employees_only'   && !targetIsEmployee)   return;
    if (audience === 'contractors_only' && !targetIsContractor) return;

    let recipientEmail: string | null = null;
    // Prefer the Paystack-verified account_name over the operator-typed
    // full_name / profiles.full_name / contractors.full_name — it's the
    // exact string on the recipient's bank statement, so the email matches
    // the money movement they actually see. Fall back through typed name
    // sources if account_name is missing (older items, verify never ran).
    let recipientName: string = (item.account_name || item.full_name || "there") as string;

    if (item.employee_id) {
      const { data } = await supabase
        .from("profiles")
        .select("email, full_name")
        .eq("id", item.employee_id)
        .maybeSingle();
      if (data) {
        recipientEmail = (data as any).email ?? null;
        // Only overwrite with profile name if we don't have a bank-verified
        // one — profile names are often casual first names.
        if (!item.account_name) {
          recipientName = (data as any).full_name || recipientName;
        }
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
        if (!item.account_name) {
          recipientName = (data as any).full_name || recipientName;
        }
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

Deno.serve(async (req) => {
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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ------------------------------------------------------------------
  // Principal Disbursements wallet funding — a Dedicated Virtual Account
  // credit arrives as charge.success. Handled here, separately from the
  // transfer.* dispatch below, since it's a completely different shape
  // (no batch_items/personal_transfers row to look up — it's new money
  // arriving, not a payment being resolved). credit_principal_wallet()
  // is idempotent (webhook_idempotency, same table transfer events use)
  // and only credits if EITHER the receiving account number or the
  // charge's customer_code matches a registered DVA — any other
  // charge.success (unrelated to this account) is a no-op. Matching on
  // both, rather than gating on authorization.channel === 'dedicated_nuban'
  // first, is deliberate: a real ₦199 test funding was silently missed
  // once already because the channel/account-number field names were
  // guessed (Paystack's docs were unreachable from this sandbox) and
  // didn't match the live payload closely enough. customer_code is a
  // well-documented, always-present top-level field and a much safer
  // primary signal than a guessed nested path.
  // ------------------------------------------------------------------
  if (event === "charge.success") {
    const receiverAccount = data?.authorization?.receiver_bank_account_number as string | undefined;
    const customerCode = data?.customer?.customer_code as string | undefined;
    const chargeRef = data?.reference as string | undefined;
    const amountNgn = Number(data?.amount || 0) / 100;

    if ((receiverAccount || customerCode) && chargeRef && amountNgn > 0) {
      try {
        const { data: creditResult, error: creditErr } = await supabase.rpc(
          "credit_principal_wallet",
          {
            p_reference: chargeRef,
            p_amount_ngn: amountNgn,
            p_receiver_account_number: receiverAccount ?? null,
            p_paystack_raw: data,
            p_customer_code: customerCode ?? null,
          },
        );
        if (creditErr) {
          console.error("[webhook] credit_principal_wallet failed:", creditErr.message, chargeRef);
        } else {
          console.info("[webhook] charge.success:", (creditResult as any)?.outcome, chargeRef, "receiverAccount:", receiverAccount, "customerCode:", customerCode);
        }
      } catch (e) {
        console.error("[webhook] credit_principal_wallet threw:", e, chargeRef);
      }
    }
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  // Only process transfer events beyond this point — ignore refund.*, etc.
  if (!event.startsWith("transfer.")) {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  const reference = data.reference as string | undefined;
  if (!reference) {
    console.warn("[webhook] No reference in event:", event);
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  // ------------------------------------------------------------------
  // H-8: For transfer.success, fetch the fee BEFORE the atomic RPC so
  // we can pass it in the same DB transaction.
  //
  // Paystack's /transfer/verify `data.fee` is the COMBINED total —
  // transfer fee + government stamp duty — not the pure transfer fee.
  // Confirmed against a real Paystack dashboard entry: "Total fees ₦75"
  // = "Transfer fees ₦25" + "Stamp duty fee ₦50". Every other place in
  // this app (receipts, cost previews, wallet checks) treats fee and
  // stamp duty as two separate line items and adds stampDutyFor() on
  // top of paystack_fee_ngn — so storing the combined value here was
  // silently double-counting the ₦50 duty on every receipt for a
  // transfer ≥ ₦10,000. Subtract it here, once, at the source, so
  // paystack_fee_ngn always means "pure transfer fee" everywhere it's
  // read. Mirrors STAMP_DUTY_THRESHOLD_NGN/STAMP_DUTY_AMOUNT_NGN in
  // src/lib/paystack.ts — keep both in sync if Paystack's duty rule
  // ever changes.
  // ------------------------------------------------------------------
  const STAMP_DUTY_THRESHOLD_NGN = 10_000;
  const STAMP_DUTY_AMOUNT_NGN = 50;
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
        const totalFeeNgn = feeKobo > 0 ? feeKobo / 100 : 0;
        const transferAmountNgn = Number(data?.amount || 0) / 100;
        const stampDuty = transferAmountNgn >= STAMP_DUTY_THRESHOLD_NGN ? STAMP_DUTY_AMOUNT_NGN : 0;
        feeNgn = Math.max(0, totalFeeNgn - stampDuty);
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
    | "processed_personal_transfer"
    | undefined;

  if (outcome === "duplicate") {
    console.info("[webhook] Duplicate delivery — skipping:", event, reference);
    return new Response("ok (duplicate)", { status: 200, headers: corsHeaders });
  }
  if (outcome === "no_match") {
    console.info("[webhook] No batch_item for reference:", reference);
    return new Response("ok (no_match)", { status: 200, headers: corsHeaders });
  }
  if (outcome === "processed_personal_transfer") {
    // Deliberately minimal — personal_transfers has no batch/contractor/
    // employee shape and no notification/reporting needs, so this takes
    // its own short-circuit rather than falling into the batch-shaped
    // logic below (which expects item_id/batch_id/full_name etc.).
    console.info(
      "[webhook] personal_transfers updated:",
      reference,
      (rpcData as any)?.status,
    );

    // Principal Disbursements wallet — every personal_transfers row is
    // director-only by table design (no separate category check needed,
    // unlike batch_items below). Debit on confirmed success; credit back
    // on a later reversal. Best-effort: the real Paystack transfer has
    // already resolved by this point regardless of what happens here.
    try {
      if (event === "transfer.success" || event === "transfer.reversed") {
        const { data: pt } = await supabase
          .from("personal_transfers")
          .select("id, amount_ngn")
          .eq("paystack_reference", reference)
          .maybeSingle();
        if (pt) {
          if (event === "transfer.success") {
            const { error: debitErr } = await supabase.rpc("debit_principal_wallet", {
              p_amount_ngn: (pt as any).amount_ngn,
              p_source: "personal_transfer",
              p_reference: reference,
              p_related_batch_item_id: null,
              p_related_personal_transfer_id: (pt as any).id,
            });
            if (debitErr) {
              console.warn("[webhook] wallet debit failed (personal_transfer):", debitErr.message, reference);
              await alertWalletDesync(supabase, "debit", "personal_transfer", reference, debitErr.message);
            }
          } else {
            const { error: refundErr } = await supabase.rpc("credit_back_principal_wallet", {
              p_amount_ngn: (pt as any).amount_ngn,
              p_reference: reference,
            });
            if (refundErr) {
              console.warn("[webhook] wallet refund failed (personal_transfer):", refundErr.message, reference);
              await alertWalletDesync(supabase, "refund", "personal_transfer", reference, refundErr.message);
            }
          }
        }
      }
    } catch (e) {
      console.warn("[webhook] wallet effect threw (personal_transfer):", e, reference);
      await alertWalletDesync(
        supabase,
        event === "transfer.success" ? "debit" : "refund",
        "personal_transfer",
        reference,
        String(e),
      );
    }

    return new Response("ok (personal_transfer)", { status: 200, headers: corsHeaders });
  }

  // outcome === 'processed' — the transactional update succeeded.
  const item = {
    id: (rpcData as any).item_id,
    batch_id: (rpcData as any).batch_id,
    full_name: (rpcData as any).full_name,
    // Paystack-verified account name (from /transferrecipient echo, written
    // back by batch-worker). Prefer this over full_name / profile name in
    // recipient-facing surfaces so the greeting matches the recipient's
    // actual bank statement. See migration 20260930001200.
    account_name: (rpcData as any).account_name,
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

  // Principal Disbursements wallet — only Company Disbursement batches
  // (the 3 director-only payment_category values) touch the wallet;
  // ordinary payroll/vendor/contractor batch_items never do. Debit on
  // confirmed success; credit back on a later reversal. Best-effort —
  // the real Paystack transfer has already resolved regardless.
  if (event === "transfer.success" || event === "transfer.reversed") {
    try {
      const { data: isDirectorBatch } = await supabase.rpc("is_director_disbursement_batch", {
        p_batch_id: item.batch_id,
      });
      if (isDirectorBatch) {
        if (event === "transfer.success") {
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
        event === "transfer.success" ? "debit" : "refund",
        "company_disbursement",
        reference,
        String(e),
      );
    }
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
