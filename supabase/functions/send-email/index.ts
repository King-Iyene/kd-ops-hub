// supabase/functions/send-email/index.ts
//
// Sends transactional emails via Resend (https://resend.com).
// Deploy: supabase functions deploy send-email --no-verify-jwt
// Secrets: supabase secrets set RESEND_API_KEY=re_...
//          supabase secrets set FROM_EMAIL=noreply@kdsquares.com
//
// Payload: { to: string, subject: string, html: string }

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

    const { to, subject, html } = await req.json();
    if (!to || !subject || !html) {
      return new Response(JSON.stringify({ ok: false, error: "to, subject, and html are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) {
      // Graceful no-op in dev: log and return success so callers don't break.
      console.warn("[send-email] RESEND_API_KEY not set — email not sent to:", to);
      return new Response(JSON.stringify({ ok: true, dev_skip: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.message ?? `Resend error (HTTP ${res.status})`);
    }

    return new Response(JSON.stringify({ ok: true, id: data.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
