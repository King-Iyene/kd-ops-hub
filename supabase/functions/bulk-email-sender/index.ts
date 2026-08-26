// supabase/functions/bulk-email-sender/index.ts
//
// Sends a previously-created email_campaigns row's recipients via Resend,
// throttled and resilient. Designed to be invoked from the React composer
// after the campaign + recipients are inserted.
//
// Body: { campaign_id: string }
//
// Auth: requires admin / super_admin / finance JWT, AND ownership of the
// campaign row. Service role bypasses (so we can later trigger from a
// scheduled job).
//
// Behaviour:
//   1. Loads campaign + pending recipients.
//   2. For each recipient, renders subject + body with merged
//      (campaign.template_vars + recipient.vars) and ships via Resend.
//   3. Updates recipient row with status / resend_id / error.
//   4. Throttles to ~10 sends/sec (Resend free-tier safe; configurable).
//   5. Rolls up campaign totals + status when finished.
//
// Deploy:
//   supabase functions deploy bulk-email-sender --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { getCorsHeaders } from "../_shared/cors.ts";
import { constantTimeEquals } from "../_shared/timing.ts";

const HTML_ESCAPE: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => HTML_ESCAPE[c]);
const truthy = (v: unknown) => {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (typeof v === "number") return v !== 0;
  if (Array.isArray(v)) return v.length > 0;
  return Boolean(v);
};
const valueOf = (vars: Record<string, unknown>, n: string) =>
  vars[n] === null || vars[n] === undefined ? "" : String(vars[n]);
function renderTemplate(template: string, vars: Record<string, unknown>): string {
  let out = template.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_m, n, b) => (truthy(vars[n]) ? b : ""));
  out = out.replace(/\{\{\^(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_m, n, b) => (truthy(vars[n]) ? "" : b));
  out = out.replace(/\{\{\{(\w+)\}\}\}/g, (_m, n) => valueOf(vars, n));
  out = out.replace(/\{\{(\w+)\}\}/g, (_m, n) => escapeHtml(valueOf(vars, n)));
  return out;
}
function wrapEmailHtml(args: { bodyHtml: string; companyName: string; logoUrl?: string | null; preheader?: string }): string {
  const { bodyHtml, companyName, logoUrl, preheader } = args;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
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
      <tr><td style="padding:14px 24px;border-top:1px solid #eef2f6;color:#5b6b75;font-size:11px">Sent by ${escapeHtml(companyName)} via KD Ops</td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}

// Throttle: wait `ms` ms between sends. Resend free tier allows ~10 req/s.
const THROTTLE_MS = 110;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ ok: false, error: "RESEND_API_KEY not configured — bulk email cannot send" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

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

    // Load campaign + verify ownership.
    const { data: campaign, error: cErr } = await service
      .from("email_campaigns").select("*").eq("id", campaign_id).single();
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
    if (["sent","failed","cancelled","sending"].includes((campaign as any).status)) {
      return new Response(JSON.stringify({ ok: false, error: `Campaign already ${(campaign as any).status}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve template if templated.
    let subjectTpl: string = (campaign as any).subject;
    let htmlTpl: string = (campaign as any).html_body;
    let textTpl: string | null = (campaign as any).text_body;
    if ((campaign as any).template_key) {
      const { data: tpl } = await service
        .from("email_templates").select("subject, html_body, text_body").eq("key", (campaign as any).template_key).maybeSingle();
      if (tpl) {
        subjectTpl = (tpl as any).subject;
        htmlTpl = (tpl as any).html_body;
        textTpl = (tpl as any).text_body;
      }
    }

    // Brand info.
    const { data: cs } = await service.from("company_settings")
      .select("company_name, logo_url").eq("id", "00000000-0000-0000-0000-000000000001").maybeSingle();
    const companyName = (cs as any)?.company_name || "KD Squares";
    const logoUrl = (cs as any)?.logo_url || null;
    const fromEmail = Deno.env.get("FROM_EMAIL") ?? `${companyName} <noreply@kdsquares.com>`;

    // Mark sending.
    await service.from("email_campaigns").update({
      status: "sending",
      started_at: new Date().toISOString(),
    }).eq("id", campaign_id);

    // Pull pending recipients in batches.
    const PAGE = 100;
    let totalSent = 0;
    let totalFailed = 0;
    let cursor = 0;

    while (true) {
      const { data: batch } = await service
        .from("email_campaign_recipients")
        .select("id, email, name, vars")
        .eq("campaign_id", campaign_id)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .range(cursor, cursor + PAGE - 1);
      const rows = (batch ?? []) as any[];
      if (rows.length === 0) break;

      for (const r of rows) {
        const mergedVars = { ...((campaign as any).template_vars || {}), ...(r.vars || {}), recipient_name: r.name || r.email };
        const renderedSubject = renderTemplate(subjectTpl, mergedVars);
        const renderedBody = renderTemplate(htmlTpl, mergedVars);
        const renderedText = textTpl ? renderTemplate(textTpl, mergedVars) : undefined;
        const html = wrapEmailHtml({ bodyHtml: renderedBody, companyName, logoUrl, preheader: renderedSubject });

        if (!RESEND_API_KEY) {
          await service.from("email_campaign_recipients").update({
            status: "skipped", error: "RESEND_API_KEY not configured", sent_at: new Date().toISOString(),
          }).eq("id", r.id);
          totalFailed++;
          continue;
        }

        try {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ from: fromEmail, to: [r.email], subject: renderedSubject, html, text: renderedText }),
            signal: AbortSignal.timeout(30_000),
          });
          const body = await res.json().catch(() => ({} as any));
          if (res.ok) {
            await service.from("email_campaign_recipients").update({
              status: "sent", resend_id: (body as any)?.id ?? null, error: null, sent_at: new Date().toISOString(),
            }).eq("id", r.id);
            totalSent++;
          } else {
            await service.from("email_campaign_recipients").update({
              status: "failed",
              error: (body as any)?.message ?? `HTTP ${res.status}`,
              sent_at: new Date().toISOString(),
            }).eq("id", r.id);
            totalFailed++;
          }
        } catch (e) {
          await service.from("email_campaign_recipients").update({
            status: "failed", error: String(e), sent_at: new Date().toISOString(),
          }).eq("id", r.id);
          totalFailed++;
        }
        await sleep(THROTTLE_MS);
      }

      cursor += PAGE;
      if (rows.length < PAGE) break;
    }

    // Compute final counts (also pick up rows that may have been sent in
    // an earlier partial run).
    const { count: cSent } = await service
      .from("email_campaign_recipients").select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign_id).eq("status", "sent");
    const { count: cFail } = await service
      .from("email_campaign_recipients").select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign_id).in("status", ["failed", "skipped"]);

    const finalStatus =
      (cFail ?? 0) === 0 ? "sent"
      : (cSent ?? 0) === 0 ? "failed"
      : "partially_sent";

    await service.from("email_campaigns").update({
      status: finalStatus,
      total_sent: cSent ?? totalSent,
      total_failed: cFail ?? totalFailed,
      completed_at: new Date().toISOString(),
    }).eq("id", campaign_id);

    return new Response(
      JSON.stringify({ ok: true, campaign_id, sent: cSent ?? totalSent, failed: cFail ?? totalFailed, status: finalStatus }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[bulk-email-sender]", err);
    return new Response(JSON.stringify({ ok: false, error: "Bulk email operation failed. Please try again later." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
