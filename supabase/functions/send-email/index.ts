// supabase/functions/send-email/index.ts
//
// Unified notification function — handles email (via Resend) and
// SMS / WhatsApp (via Termii) from a single endpoint.
//
// Deploy: supabase functions deploy send-email --no-verify-jwt
//
// Secrets:
//   Email:   supabase secrets set RESEND_API_KEY=re_...
//            supabase secrets set FROM_EMAIL=noreply@kdsquares.com
//   Termii:  supabase secrets set TERMII_API_KEY=TL...
//            supabase secrets set TERMII_SENDER_ID=KDOps
//
// Payload:
//   Email:     { channel?: 'email', to: string, subject: string, html: string }
//   SMS:       { channel: 'sms',       to: string, message: string }
//   WhatsApp:  { channel: 'whatsapp',  to: string, message: string }
//
// `channel` defaults to 'email' so all existing callers continue working
// without any changes.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth gate: require a valid Supabase JWT.
    // Function is deployed with --no-verify-jwt so the platform doesn't reject
    // before we get here; we validate the token in code so error messages are
    // explicit and so this stays consistent with paystack-transfer.
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !user) {
      return new Response(
        JSON.stringify({ ok: false, error: authError?.message || "Not authenticated" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Rate limit: max 10 notifications per user per 60 seconds.
    // Uses the audit_logs table (already present) for a lightweight count —
    // no extra table needed. Fails open (allows send) if the check errors.
    try {
      const serviceRl = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const since = new Date(Date.now() - 60_000).toISOString();
      const { count } = await serviceRl
        .from("audit_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("action", "send_notification")
        .gte("created_at", since);
      if ((count ?? 0) >= 10) {
        return new Response(
          JSON.stringify({ ok: false, error: "Rate limit exceeded — max 10 notifications per minute" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      // Log this notification attempt for rate-limit accounting.
      await serviceRl.from("audit_logs").insert({
        user_id: user.id,
        action: "send_notification",
        table_name: "notifications",
      });
    } catch (_) {
      // Fail open — don't block notification on rate-limit check failure.
    }

    const body = await req.json();
    const channel: string = body.channel ?? "email";

    // ─── SMS / WhatsApp via Termii ──────────────────────────────────────────
    if (channel === "sms" || channel === "whatsapp") {
      const { to, message } = body;
      if (!to || !message) {
        return new Response(
          JSON.stringify({ ok: false, error: "to and message are required for SMS/WhatsApp" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const termiiKey = Deno.env.get("TERMII_API_KEY");
      if (!termiiKey) {
        console.warn("[send-email] TERMII_API_KEY not set — SMS not sent to:", to);
        return new Response(
          JSON.stringify({ ok: true, dev_skip: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const senderId = Deno.env.get("TERMII_SENDER_ID") ?? "KDOps";
      // Termii uses "generic" for SMS and "whatsapp" for WhatsApp.
      const termiiChannel = channel === "whatsapp" ? "whatsapp" : "generic";

      const res = await fetch("https://api.ng.termii.com/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: termiiKey,
          to,
          from: senderId,
          sms: message,
          type: "plain",
          channel: termiiChannel,
        }),
      });

      let data: any;
      try {
        data = await res.json();
      } catch {
        // Termii returned non-JSON (e.g. HTML error page)
        return new Response(
          JSON.stringify({ ok: false, error: `Termii returned non-JSON response (HTTP ${res.status})` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (!res.ok || data?.code === "error") {
        return new Response(
          JSON.stringify({ ok: false, error: data?.message ?? `Termii error (HTTP ${res.status})`, termii: data }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({ ok: true, message_id: data.message_id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── Email via Resend (default, existing behaviour unchanged) ───────────
    const { to, subject, html } = body;
    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ ok: false, error: "to, subject, and html are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) {
      console.warn("[send-email] RESEND_API_KEY not set — email not sent to:", to);
      return new Response(
        JSON.stringify({ ok: true, dev_skip: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const from = Deno.env.get("FROM_EMAIL") ?? "KD Squares <noreply@kdsquares.com>";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });

    let data: any;
    try {
      data = await res.json();
    } catch {
      return new Response(
        JSON.stringify({ ok: false, error: `Resend returned non-JSON response (HTTP ${res.status})` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!res.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: data?.message ?? `Resend error (HTTP ${res.status})`, resend: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ ok: true, id: data.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
