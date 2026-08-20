// supabase/functions/message-campaign-sender/index.ts
//
// Sends a previously-created message_campaigns row's recipients via Termii
// (SMS or WhatsApp). The SMS/WhatsApp equivalent of bulk-email-sender —
// same shape, same throttling approach, same status rollup — just calling
// Termii's /api/sms/send instead of Resend.
//
// Body: { campaign_id: string }
//
// Auth: requires admin / super_admin / finance JWT, AND ownership of the
// campaign row. Service role bypasses (so the campaign-scheduler cron job
// can trigger this without a user session).
//
// Deploy:
//   supabase functions deploy message-campaign-sender --no-verify-jwt
//   supabase secrets set TERMII_API_KEY=...        (shared with send-email)
//   supabase secrets set TERMII_SENDER_ID=KDOps     (shared with send-email)
//   supabase secrets set TERMII_WHATSAPP_SENDER=... (shared with send-email)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { getCorsHeaders } from "../_shared/cors.ts";
import { constantTimeEquals } from "../_shared/timing.ts";

// Termii's own rate guidance is generous, but we throttle gently to stay
// well clear of any account-level burst limit — matches bulk-email-sender's
// caution around Resend's free-tier rate.
const THROTTLE_MS = 150;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const TERMII_API_KEY = Deno.env.get("TERMII_API_KEY");
    const smsSenderId = Deno.env.get("TERMII_SENDER_ID") ?? "KDOps";
    const waSenderId = Deno.env.get("TERMII_WHATSAPP_SENDER") ?? "Termii";

    const service = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.replace("Bearer ", "");
    const isServiceRole = constantTimeEquals(bearer, SERVICE_ROLE);

    let actorId: string | null = null;
    if (!isServiceRole) {
      const userClient = createClient(SUPABASE_URL, ANON_KEY);
      const { data: { user } } = await userClient.auth.getUser(bearer);
      if (!user) {
        return new Response(JSON.stringify({ ok: false, error: "Not authenticated" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: profile } = await service.from("profiles").select("role").eq("id", user.id).single();
      if (!profile || !["super_admin", "admin", "finance"].includes((profile as any).role)) {
        return new Response(JSON.stringify({ ok: false, error: "Insufficient permissions" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      actorId = user.id;
    }

    const { campaign_id } = await req.json();
    if (!campaign_id) {
      return new Response(JSON.stringify({ ok: false, error: "campaign_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: campaign, error: cErr } = await service
      .from("message_campaigns").select("*").eq("id", campaign_id).single();
    if (cErr || !campaign) {
      return new Response(JSON.stringify({ ok: false, error: "Campaign not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!isServiceRole && actorId && (campaign as any).created_by !== actorId) {
      return new Response(JSON.stringify({ ok: false, error: "Not your campaign" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (["sent", "failed", "cancelled", "sending"].includes((campaign as any).status)) {
      return new Response(JSON.stringify({ ok: false, error: `Campaign already ${(campaign as any).status}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const channel: string = (campaign as any).channel;
    const message: string = (campaign as any).message;
    const senderId = channel === "whatsapp" ? waSenderId : smsSenderId;
    const termiiChannel = channel === "whatsapp" ? "whatsapp" : "generic";

    await service.from("message_campaigns").update({
      status: "sending",
      started_at: new Date().toISOString(),
    }).eq("id", campaign_id);

    const PAGE = 100;
    let cursor = 0;

    while (true) {
      const { data: batch } = await service
        .from("message_campaign_recipients")
        .select("id, to_address")
        .eq("campaign_id", campaign_id)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .range(cursor, cursor + PAGE - 1);
      const rows = (batch ?? []) as any[];
      if (rows.length === 0) break;

      for (const r of rows) {
        if (!TERMII_API_KEY) {
          await service.from("message_campaign_recipients").update({
            status: "skipped", error: "TERMII_API_KEY not configured", sent_at: new Date().toISOString(),
          }).eq("id", r.id);
          continue;
        }

        try {
          const res = await fetch("https://api.ng.termii.com/api/sms/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(30_000),
            body: JSON.stringify({
              api_key: TERMII_API_KEY,
              to: r.to_address,
              from: senderId,
              sms: message,
              type: "plain",
              channel: termiiChannel,
            }),
          });
          const rawText = await res.text();
          let data: any;
          try { data = JSON.parse(rawText); } catch { data = null; }

          if (res.ok && data && data.code !== "error") {
            await service.from("message_campaign_recipients").update({
              status: "sent", provider_id: data?.message_id ?? null, error: null, sent_at: new Date().toISOString(),
            }).eq("id", r.id);
          } else {
            const errMsg = data?.message ?? (rawText.trim() || `HTTP ${res.status}`);
            await service.from("message_campaign_recipients").update({
              status: "failed", error: errMsg, sent_at: new Date().toISOString(),
            }).eq("id", r.id);
          }
        } catch (e) {
          await service.from("message_campaign_recipients").update({
            status: "failed", error: String(e), sent_at: new Date().toISOString(),
          }).eq("id", r.id);
        }
        await sleep(THROTTLE_MS);
      }

      cursor += PAGE;
      if (rows.length < PAGE) break;
    }

    const { count: cSent } = await service
      .from("message_campaign_recipients").select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign_id).eq("status", "sent");
    const { count: cFail } = await service
      .from("message_campaign_recipients").select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign_id).in("status", ["failed", "skipped"]);

    const finalStatus =
      (cFail ?? 0) === 0 ? "sent"
      : (cSent ?? 0) === 0 ? "failed"
      : "partially_sent";

    await service.from("message_campaigns").update({
      status: finalStatus,
      total_sent: cSent ?? 0,
      total_failed: cFail ?? 0,
      completed_at: new Date().toISOString(),
    }).eq("id", campaign_id);

    return new Response(
      JSON.stringify({ ok: true, campaign_id, sent: cSent ?? 0, failed: cFail ?? 0, status: finalStatus }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
