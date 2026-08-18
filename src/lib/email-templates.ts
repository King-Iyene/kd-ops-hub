// Email Templates client lib
//
// CRUD over the email_templates table + a small Mustache-style renderer
// shared by the Settings editor preview and any in-app composer.

import { supabase } from '@/lib/supabase';

export interface EmailTemplate {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: 'payments' | 'hr' | 'compliance' | 'ops' | 'security' | 'custom';
  subject: string;
  html_body: string;
  text_body: string | null;
  variables: { name: string; description?: string; example?: string }[];
  default_subject: string;
  default_html_body: string;
  default_text_body: string | null;
  is_system: boolean;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function listEmailTemplates(): Promise<EmailTemplate[]> {
  const { data, error } = await supabase
    .from('email_templates')
    .select('id, key, name, category, description, subject, html_body, text_body, variables, is_system, default_subject, default_html_body, default_text_body')
    .order('category')
    .order('name');
  if (error) throw error;
  return (data ?? []) as EmailTemplate[];
}

export async function getEmailTemplateByKey(key: string): Promise<EmailTemplate | null> {
  const { data, error } = await supabase
    .from('email_templates')
    .select('*')
    .eq('key', key)
    .maybeSingle();
  if (error) throw error;
  return (data as EmailTemplate) ?? null;
}

export async function updateEmailTemplate(
  id: string,
  patch: Pick<EmailTemplate, 'subject' | 'html_body' | 'text_body'>,
): Promise<void> {
  const { error } = await supabase
    .from('email_templates')
    .update({
      subject: patch.subject,
      html_body: patch.html_body,
      text_body: patch.text_body,
    })
    .eq('id', id);
  if (error) throw error;
}

// Create a brand-new custom template. Always lands in the 'custom'
// category and is_system=false — system templates are seeded at migration
// time and operators shouldn't be able to mint new ones from the UI.
//
// `key` becomes the stable identifier the rest of the platform uses to
// look up this template; we slugify the user-supplied name so they don't
// have to think about it. Failures on duplicate-key bubble up as a
// readable Postgres error.
export async function createEmailTemplate(input: {
  name: string;
  description?: string | null;
  subject?: string;
  html_body?: string;
  text_body?: string | null;
}): Promise<EmailTemplate> {
  const slug = input.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'custom_template';
  const key = `custom.${slug}`;

  const subject  = input.subject  ?? `${input.name} — {{company_name}}`;
  const htmlBody = input.html_body
    ?? `<p>Hello {{recipient_name}},</p>\n<p>This is a new template. Edit me in Settings → Email Templates.</p>\n<p>Regards,<br/>{{company_name}}</p>`;
  const textBody = input.text_body ?? null;

  const { data, error } = await supabase
    .from('email_templates')
    .insert({
      key,
      name: input.name,
      description: input.description ?? null,
      category: 'custom',
      subject,
      html_body: htmlBody,
      text_body: textBody,
      // Default the "factory copy" to whatever the user is creating with —
      // Reset becomes a no-op until the operator edits and saves again,
      // which is the correct semantics for a self-authored template.
      default_subject: subject,
      default_html_body: htmlBody,
      default_text_body: textBody,
      is_system: false,
      variables: [],
    })
    .select('key, name')
    .single();
  if (error) throw error;
  return data as EmailTemplate;
}

export async function deleteEmailTemplate(id: string): Promise<void> {
  const { error } = await supabase
    .from('email_templates')
    .delete()
    .eq('id', id)
    .eq('is_system', false); // Defensive — RLS already blocks system rows.
  if (error) throw error;
}

export async function resetEmailTemplate(id: string): Promise<void> {
  // Server-side update reverts the editable fields to the frozen defaults.
  const { data: row, error: fetchErr } = await supabase
    .from('email_templates')
    .select('default_subject, default_html_body, default_text_body')
    .eq('id', id)
    .single();
  if (fetchErr) throw fetchErr;
  await updateEmailTemplate(id, {
    subject: row.default_subject,
    html_body: row.default_html_body,
    text_body: row.default_text_body,
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Renderer
//
// Supports:
//   - {{var}}              → HTML-escaped substitution
//   - {{{var}}}            → raw substitution (use sparingly; only for vars
//                             you control, e.g. pre-built HTML snippets)
//   - {{#var}}…{{/var}}    → conditional block, rendered only if truthy
//   - {{^var}}…{{/var}}    → inverted block, rendered if falsy
//
// Missing vars become empty string. No external deps — keeps the bundle tiny
// and lets us run it in edge functions too.
// ───────────────────────────────────────────────────────────────────────────

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPE[c]);
}

export function renderTemplate(
  template: string,
  vars: Record<string, unknown>,
): string {
  // Conditional blocks first (#var and ^var). Greedy false: use [\s\S] to
  // span newlines and lazy match so nested blocks survive.
  let out = template.replace(
    /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_m, name, body) => (truthy(vars[name]) ? body : ''),
  );
  out = out.replace(
    /\{\{\^(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_m, name, body) => (truthy(vars[name]) ? '' : body),
  );
  // Triple-brace = raw.
  out = out.replace(/\{\{\{(\w+)\}\}\}/g, (_m, name) => valueOf(vars, name));
  // Double-brace = HTML-escaped.
  out = out.replace(/\{\{(\w+)\}\}/g, (_m, name) => escapeHtml(valueOf(vars, name)));
  return out;
}

function truthy(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (typeof v === 'number') return v !== 0;
  if (Array.isArray(v)) return v.length > 0;
  return Boolean(v);
}
function valueOf(vars: Record<string, unknown>, name: string): string {
  const v = vars[name];
  if (v === null || v === undefined) return '';
  return String(v);
}

/**
 * Wrap rendered body HTML in a branded shell. Kept simple — the email_templates
 * `html_body` is already a complete content snippet; this adds header/footer.
 * Inline styles only (no <link>) for max client compatibility.
 */
export function wrapEmailHtml(args: {
  bodyHtml: string;
  companyName: string;
  logoUrl?: string | null;
  preheader?: string;
}): string {
  const { bodyHtml, companyName, logoUrl, preheader } = args;
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f6f9fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a2733;">
${preheader ? `<div style="display:none;font-size:1px;line-height:1px;color:#f6f9fb">${escapeHtml(preheader)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f9fb">
  <tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8ef">
      <tr><td style="padding:18px 24px;border-bottom:1px solid #eef2f6;display:flex;align-items:center;gap:8px">
        ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(companyName)}" height="28" style="height:28px;width:auto;display:inline-block;vertical-align:middle" />` : ''}
        <span style="font-weight:600;font-size:14px;color:#1a2733">${escapeHtml(companyName)}</span>
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

/**
 * Send a templated email. Goes through the existing send-email edge function
 * with channel='templated' so we keep one transport.
 */
export async function sendTemplatedEmail(args: {
  templateKey: string;
  to: string;
  vars: Record<string, unknown>;
  subjectOverride?: string;
}): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke('send-email', {
    body: {
      channel: 'templated',
      template_key: args.templateKey,
      to: args.to,
      vars: args.vars,
      subject_override: args.subjectOverride,
    },
  });
  if (error) return { ok: false, error: error.message };
  if ((data as any)?.ok === false) return { ok: false, error: (data as any).error };
  return { ok: true, id: (data as any)?.id };
}
