// supabase/functions/campaign-scheduler/index.ts
//
// Dispatches due scheduled campaigns — email_campaigns and message_campaigns
// rows with status='scheduled' and scheduled_for <= now(). Invoked by
// pg_cron every 5 minutes (see the tick_campaign_scheduler() function and
// campaign-scheduler-tick job in the message_campaigns_and_scheduling
// migration).
//
// Auth: X-Cron-Secret header must match CRON_SHARED_SECRET (same secret
// used by batch-worker / payroll-scheduler — not per-function).
//
// The claim lives in the sender, NOT here. This function only finds due rows
// and hands each to its sender; the sender atomically flips the row
// 'scheduled' -> 'sending' (claim_campaign_for_sending /
// claim_message_campaign_for_sending: UPDATE ... WHERE status = 'scheduled'
// AND scheduled_for <= now() RETURNING). If another tick or sender already
// claimed it, the sender answers 409 and nothing is sent twice. (Previously
// this function flipped the row to 'sending' itself and the senders then
// refused anything already 'sending', so scheduled campaigns never sent.)
// A hand-off that fails before the claim leaves the row 'scheduled', so the
// next tick retries it.
//
// Deploy:
//   supabase functions deploy campaign-scheduler --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { getCorsHeaders } from "../_shared/cors.ts";
import { constantTimeEquals } from "../_shared/timing.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const CRON_SHARED_SECRET = Deno.env.get("CRON_SHARED_SECRET");
    const providedSecret = req.headers.get("X-Cron-Secret");
    if (!constantTimeEquals(providedSecret, CRON_SHARED_SECRET)) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const service = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    const nowIso = new Date().toISOString();
    const dispatched: { table: string; id: string; ok: boolean }[] = [];

    // ─── Email campaigns ─────────────────────────────────────────────────
    const { data: dueEmail } = await service
      .from("email_campaigns")
      .select("id")
      .eq("status", "scheduled")
      .lte("scheduled_for", nowIso);

    for (const row of (dueEmail ?? []) as any[]) {
      const { error } =await service.functions.invoke("bulk-email-sender", {
        body: { campaign_id: row.id },
        headers: { Authorization: `Bearer ${SERVICE_ROLE}` },
      });
      dispatched.push({ table: "email_campaigns", id: row.id, ok: !error });
    }

    // ─── SMS / WhatsApp campaigns ────────────────────────────────────────
    const { data: dueMessage } = await service
      .from("message_campaigns")
      .select("id")
      .eq("status", "scheduled")
      .lte("scheduled_for", nowIso);

    for (const row of (dueMessage ?? []) as any[]) {
      const { error } =await service.functions.invoke("message-campaign-sender", {
        body: { campaign_id: row.id },
        headers: { Authorization: `Bearer ${SERVICE_ROLE}` },
      });
      dispatched.push({ table: "message_campaigns", id: row.id, ok: !error });
    }

    return new Response(
      JSON.stringify({ ok: true, dispatched_count: dispatched.length, dispatched }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[campaign-scheduler]", err);
    return new Response(JSON.stringify({ ok: false, error: "Campaign scheduling failed. Please try again later." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
