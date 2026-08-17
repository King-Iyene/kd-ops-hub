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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// ─── Mustache-lite renderer (mirrors src/lib/email-templates.ts) ────────────
const HTML_ESCAPE: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPE[c]);
}
function truthy(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (typeof v === "number") return v !== 0;
  if (Array.isArray(v)) return v.length > 0;
  return Boolean(v);
}
function valueOf(vars: Record<string, unknown>, name: string): string {
  const v = vars[name];
  if (v === null || v === undefined) return "";
  return String(v);
}
function renderTemplate(template: string, vars: Record<string, unknown>): string {
  let out = template.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_m, n, b) => (truthy(vars[n]) ? b : ""));
  out = out.replace(/\{\{\^(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_m, n, b) => (truthy(vars[n]) ? "" : b));
  out = out.replace(/\{\{\{(\w+)\}\}\}/g, (_m, n) => valueOf(vars, n));
  out = out.replace(/\{\{(\w+)\}\}/g, (_m, n) => escapeHtml(valueOf(vars, n)));
  return out;
}
function wrapEmailHtml(args: { bodyHtml: string; companyName: string; logoUrl?: string | null; preheader?: string }): string {
  const { bodyHtml, companyName, logoUrl, preheader } = args;
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f6f9fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a2733;">
${preheader ? `<div style="display:none;font-size:1px;line-height:1px;color:#f6f9fb">${escapeHtml(preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f9fb">
  <tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8ef">
      <tr><td style="padding:18px 24px;border-bottom:1px solid #eef2f6">
        ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(companyName)}" height="28" style="height:28px;width:auto;display:inline-block;vertical-align:middle" />` : ""}
        <span style="font-weight:600;font-size:14px;color:#1a2733;margin-left:8px">${escapeHtml(companyName)}</span>
      </td></tr>
      <tr><td style="padding:24px;font-size:14px;line-height:1.55">${bodyHtml}</td></tr>
      <tr><td style="padding:14px 24px;border-top:1px solid #eef2f6;color:#5b6b75;font-size:11px">
        Sent by ${escapeHtml(companyName)} via KD Ops · do-not-reply
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth gate: require a valid Supabase JWT, OR the service-role bearer
    // for server-initiated sends from other edge functions / scheduled jobs.
    // Function is deployed with --no-verify-jwt so the platform doesn't reject
    // before we get here; we validate the token in code so error messages are
    // explicit and so this stays consistent with paystack-transfer.
    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.replace("Bearer ", "");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const isServiceRole = bearer && bearer === SERVICE_ROLE;
    let user: { id: string } | null = null;
    if (!isServiceRole) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
      );
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(bearer);
      if (authError || !authUser) {
        return new Response(
          JSON.stringify({ ok: false, error: authError?.message || "Not authenticated" }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      user = authUser;

      // Role gate: only admin, super_admin, and operations may send
      // notifications directly. Other roles (field_staff, drivers) have
      // no business invoking this endpoint — notifications for them are
      // sent server-side via service-role callers (webhooks, edge functions).
      const roleClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { data: senderProfile } = await roleClient
        .from("profiles")
        .select("role")
        .eq("id", authUser.id)
        .single();
      const allowedSendRoles = ["super_admin", "admin", "operations"];
      if (!senderProfile || !allowedSendRoles.includes((senderProfile as any).role)) {
        return new Response(
          JSON.stringify({ ok: false, error: "Your role is not permitted to send notifications" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    // Rate limit: max 10 notifications per user per 60 seconds.
    // Service-role calls (server-initiated) skip the rate limit since they
    // come from trusted backend code (webhooks, schedulers).
    if (!isServiceRole && user) {
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
        await serviceRl.from("audit_logs").insert({
          user_id: user.id,
          action: "send_notification",
          table_name: "notifications",
        });
      } catch (_) {
        // Fail open — don't block notification on rate-limit check failure.
      }
    }

    const body = await req.json();
    const channel: string = body.channel ?? "email";

    // ─── Templated email via Resend ─────────────────────────────────────────
    // Loads a row from email_templates by key, renders subject/body with
    // {{vars}}, wraps in branded shell, ships via Resend. Logs every send to
    // notifications_log if the table exists (best effort).
    if (channel === "templated") {
      const { template_key, to, vars, subject_override } = body;
      if (!template_key || !to) {
        return new Response(
          JSON.stringify({ ok: false, error: "template_key and to are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const serviceClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { data: tpl, error: tplErr } = await serviceClient
        .from("email_templates")
        .select("subject, html_body, text_body")
        .eq("key", template_key)
        .maybeSingle();
      if (tplErr || !tpl) {
        return new Response(
          JSON.stringify({ ok: false, error: `Template '${template_key}' not found` }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const { data: cs } = await serviceClient
        .from("company_settings")
        .select("company_name, logo_url")
        .eq("id", "00000000-0000-0000-0000-000000000001")
        .maybeSingle();
      const companyName = (cs as any)?.company_name || "KD Squares";
      const logoUrl = (cs as any)?.logo_url || null;

      const renderedSubject = subject_override
        ? String(subject_override)
        : renderTemplate((tpl as any).subject, vars || {});
      const renderedBody = renderTemplate((tpl as any).html_body, vars || {});
      const renderedText = (tpl as any).text_body
        ? renderTemplate((tpl as any).text_body, vars || {})
        : undefined;

      const html = wrapEmailHtml({
        bodyHtml: renderedBody,
        companyName,
        logoUrl,
        preheader: renderedSubject,
      });

      const apiKey = Deno.env.get("RESEND_API_KEY");
      if (!apiKey) {
        console.warn("[send-email] RESEND_API_KEY not set — templated email skipped:", to);
        return new Response(
          JSON.stringify({ ok: true, dev_skip: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const from = Deno.env.get("FROM_EMAIL") ?? `${companyName} <noreply@kdsquares.com>`;
      const recipients = Array.isArray(to) ? to : [to];

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: recipients,
          subject: renderedSubject,
          html,
          text: renderedText,
        }),
      });
      const rawText = await res.text();
      let data: any;
      try { data = JSON.parse(rawText); } catch {
        return new Response(
          JSON.stringify({ ok: false, error: `Resend non-JSON (HTTP ${res.status})`, raw: rawText.slice(0, 400) }),
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
        JSON.stringify({ ok: true, id: data.id, template_key, to: recipients }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

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

      // WhatsApp requires a registered WhatsApp Business sender — a text
      // sender ID like "KDOps" only works for SMS.  Use a separate secret
      // TERMII_WHATSAPP_SENDER (your WhatsApp Business number or "Termii"
      // for Termii's shared sender) and fall back to "Termii" if not set.
      const smsSenderId = Deno.env.get("TERMII_SENDER_ID") ?? "KDOps";
      const waSenderId  = Deno.env.get("TERMII_WHATSAPP_SENDER") ?? "Termii";
      const senderId    = channel === "whatsapp" ? waSenderId : smsSenderId;
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

      const rawText = await res.text();
      let data: any;
      try {
        data = JSON.parse(rawText);
      } catch {
        // Termii returned non-JSON (e.g. HTML error page or empty body).
        // Include the sender/channel in the error so it's easy to diagnose.
        const hint = rawText.trim().length > 0
          ? rawText.slice(0, 500)
          : `(empty body) — check that the WhatsApp sender "${senderId}" is registered on your Termii account, or set TERMII_WHATSAPP_SENDER to a valid WhatsApp Business number.`;
        return new Response(
          JSON.stringify({
            ok: false,
            error: `Termii returned non-JSON response (HTTP ${res.status})`,
            termii_raw: hint,
          }),
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
