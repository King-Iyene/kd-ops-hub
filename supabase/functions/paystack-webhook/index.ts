// supabase/functions/paystack-webhook/index.ts
//
// Paystack webhook receiver. Register this URL in your Paystack dashboard:
//   https://<project-ref>.supabase.co/functions/v1/paystack-webhook
//
// Deploy: supabase functions deploy paystack-webhook --no-verify-jwt
// Set secret: supabase secrets set PAYSTACK_SECRET_KEY=sk_live_...
//
// Events handled:
//   transfer.success  — mark batch_item as succeeded
//   transfer.failed   — mark batch_item as failed with reason
//   transfer.reversed — mark batch_item as failed (reversed)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { createHmac } from "https://deno.land/std@0.177.0/node/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-paystack-signature",
};

function verifySignature(body: string, signature: string): boolean {
  const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!secret) return false;
  const hash = createHmac("sha512", secret).update(body).digest("hex");
  return hash === signature;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature") ?? "";

  if (!verifySignature(rawBody, signature)) {
    console.warn("[paystack-webhook] Invalid signature");
    return new Response("Invalid signature", { status: 401 });
  }

  const payload = JSON.parse(rawBody);
  const event = payload?.event as string | undefined;
  const data = payload?.data;

  if (!event || !data) {
    return new Response("Missing event or data", { status: 400 });
  }

  // Service-role client to bypass RLS.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const reference = data.reference as string | undefined;
  if (!reference) {
    return new Response("No reference", { status: 200 });
  }

  // Find the batch_item by paystack_reference.
  const { data: item } = await supabase
    .from("batch_items")
    .select("id, full_name, batch_id")
    .eq("paystack_reference", reference)
    .maybeSingle();

  if (!item) {
    // Not a KDOps transfer — ignore.
    return new Response("ok", { status: 200 });
  }

  const now = new Date().toISOString();

  if (event === "transfer.success") {
    await supabase
      .from("batch_items")
      .update({
        status: "succeeded",
        failure_reason: null,
        processed_at: now,
        paystack_raw: data,
      })
      .eq("id", item.id);

    await supabase.from("audit_logs").insert({
      action_type: "paystack_transfer_succeeded",
      description: `Webhook: transfer succeeded for ${item.full_name} (ref ${reference})`,
      performed_by_name: "Paystack Webhook",
    });

    // Notify Finance via in-app notification.
    const { data: financeUsers } = await supabase
      .from("profiles")
      .select("id")
      .in("role", ["super_admin", "admin", "finance"]);
    if (financeUsers) {
      for (const u of financeUsers) {
        await supabase.from("notifications").insert({
          user_id: u.id,
          type: "transfer_success",
          module: "payments",
          priority: "normal",
          title: `Payment to ${item.full_name} succeeded`,
          body: `Paystack ref: ${reference}`,
        });
      }
    }
  } else if (event === "transfer.failed" || event === "transfer.reversed") {
    const reason =
      data.failures?.[0]?.reason ||
      data.reason ||
      `Transfer ${event.replace("transfer.", "")}`;

    await supabase
      .from("batch_items")
      .update({
        status: "failed",
        failure_reason: reason,
        processed_at: now,
        paystack_raw: data,
      })
      .eq("id", item.id);

    await supabase.from("audit_logs").insert({
      action_type: "paystack_transfer_failed",
      description: `Webhook: transfer ${event.replace("transfer.", "")} for ${item.full_name}: ${reason}`,
      performed_by_name: "Paystack Webhook",
    });

    const { data: financeUsers } = await supabase
      .from("profiles")
      .select("id")
      .in("role", ["super_admin", "admin", "finance"]);
    if (financeUsers) {
      for (const u of financeUsers) {
        await supabase.from("notifications").insert({
          user_id: u.id,
          type: "transfer_failed",
          module: "payments",
          priority: "high",
          title: `Payment to ${item.full_name} failed`,
          body: reason,
        });
      }
    }
  }

  // After updating the item, recheck whether the entire batch is settled.
  const { data: allItems } = await supabase
    .from("batch_items")
    .select("status")
    .eq("batch_id", item.batch_id);

  if (allItems) {
    const anyFailed = allItems.some((i: any) => i.status === "failed");
    const anyPending = allItems.some(
      (i: any) => i.status === "pending" || i.status === "retry"
    );
    const finalStatus = anyPending
      ? "processing"
      : anyFailed
      ? "partially_processed"
      : "processed";
    await supabase
      .from("payment_batches")
      .update({ status: finalStatus })
      .eq("id", item.batch_id);
  }

  return new Response("ok", { status: 200, headers: corsHeaders });
});
