// supabase/functions/timetrack-export-runner/index.ts
//
// Export Center's recurring half. Runs every due row in
// time_export_schedules: pulls the data (time entries, activity, or
// expenses) for the schedule's lookback window, builds a CSV, uploads it to
// the private timetrack-exports bucket, mints a 7-day signed URL, and emails
// it to the schedule's recipient via the existing send-email function.
//
// AUTH (deployed --no-verify-jwt, validated in code):
//   • X-Cron-Secret == CRON_SHARED_SECRET   (pg_cron hourly tick), or
//   • a Supabase JWT for a super_admin / admin user, with a specific
//     { schedule_id } body — the Export Center's "Send now" button.
//
// Deploy:  supabase functions deploy timetrack-export-runner --no-verify-jwt
// Secrets: CRON_SHARED_SECRET (already set for other cron jobs), plus
//          RESEND_API_KEY / FROM_EMAIL already set for send-email.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { getCorsHeaders } from "../_shared/cors.ts";
import { constantTimeEquals } from "../_shared/timing.ts";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY    = Deno.env.get("SUPABASE_ANON_KEY")!;
const CRON_SHARED_SECRET   = Deno.env.get("CRON_SHARED_SECRET");

interface ExportSchedule {
  id: string;
  name: string;
  data_type: "time_entries" | "activity" | "expenses";
  lookback_days: number;
  frequency: "daily" | "weekly" | "monthly";
  recipient_email: string;
}

function csvField(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) return `"'${s.replace(/"/g, '""')}"`;
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvField).join(",")).join("\n");
}

async function buildCsvForSchedule(svc: ReturnType<typeof createClient>, sched: ExportSchedule): Promise<string> {
  const since = new Date(Date.now() - sched.lookback_days * 86_400_000).toISOString();

  if (sched.data_type === "time_entries") {
    const { data, error } = await svc
      .from("time_entries")
      .select("employee_id, project_id, task_id, start_time, end_time, duration_minutes, is_billable, invoiced, notes")
      .gte("start_time", since)
      .order("start_time", { ascending: false })
      .limit(20000);
    if (error) throw error;
    const rows = (data ?? []).map((r: Record<string, unknown>) => [
      r.employee_id, r.project_id, r.task_id, r.start_time, r.end_time, r.duration_minutes, r.is_billable, r.invoiced, r.notes,
    ]);
    return toCsv(["employee_id", "project_id", "task_id", "start_time", "end_time", "duration_minutes", "is_billable", "invoiced", "notes"], rows);
  }

  if (sched.data_type === "activity") {
    const { data, error } = await svc
      .from("time_activity_logs")
      .select("employee_id, app_name, window_title, url, productivity_category, is_outside_geofence, captured_at")
      .gte("captured_at", since)
      .order("captured_at", { ascending: false })
      .limit(20000);
    if (error) throw error;
    const rows = (data ?? []).map((r: Record<string, unknown>) => [
      r.employee_id, r.app_name, r.window_title, r.url, r.productivity_category, r.is_outside_geofence, r.captured_at,
    ]);
    return toCsv(["employee_id", "app_name", "window_title", "url", "productivity_category", "is_outside_geofence", "captured_at"], rows);
  }

  // expenses
  const { data, error } = await svc
    .from("time_expenses")
    .select("employee_id, project_id, client_id, category_id, amount, currency, expense_date, is_billable, status, description")
    .gte("expense_date", since.slice(0, 10))
    .order("expense_date", { ascending: false })
    .limit(20000);
  if (error) throw error;
  const rows = (data ?? []).map((r: Record<string, unknown>) => [
    r.employee_id, r.project_id, r.client_id, r.category_id, r.amount, r.currency, r.expense_date, r.is_billable, r.status, r.description,
  ]);
  return toCsv(["employee_id", "project_id", "client_id", "category_id", "amount", "currency", "expense_date", "is_billable", "status", "description"], rows);
}

function nextRunAt(sched: ExportSchedule, from: Date): Date {
  const d = new Date(from);
  if (sched.frequency === "daily") d.setUTCDate(d.getUTCDate() + 1);
  else if (sched.frequency === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

async function runSchedule(svc: ReturnType<typeof createClient>, sched: ExportSchedule): Promise<{ ok: boolean; error?: string }> {
  try {
    const csv = await buildCsvForSchedule(svc, sched);
    const path = `${sched.id}/${Date.now()}.csv`;
    const { error: upErr } = await svc.storage.from("timetrack-exports").upload(path, new Blob([csv], { type: "text/csv" }), { contentType: "text/csv" });
    if (upErr) return { ok: false, error: `upload failed: ${upErr.message}` };

    const { data: signed, error: signErr } = await svc.storage.from("timetrack-exports").createSignedUrl(path, 7 * 86_400);
    if (signErr || !signed?.signedUrl) return { ok: false, error: `sign failed: ${signErr?.message ?? "no url"}` };

    const emailRes = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
      body: JSON.stringify({
        channel: "email",
        to: sched.recipient_email,
        subject: `Time Expenses export ready: ${sched.name}`,
        html: `<p>Your scheduled "${sched.name}" export (${sched.data_type}, last ${sched.lookback_days} days) is ready.</p>` +
              `<p><a href="${signed.signedUrl}">Download CSV</a> — this link expires in 7 days.</p>`,
      }),
    });
    if (!emailRes.ok) return { ok: false, error: `email send failed: HTTP ${emailRes.status}` };

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const isCron = constantTimeEquals(req.headers.get("X-Cron-Secret"), CRON_SHARED_SECRET);
  let runNowScheduleId: string | null = null;

  if (!isCron) {
    const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!bearer) return json(401, { ok: false, error: "Not authenticated" });
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: { user }, error: authErr } = await anon.auth.getUser(bearer);
    if (authErr || !user) return json(401, { ok: false, error: authErr?.message ?? "Not authenticated" });
    const svcAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
    const { data: profile } = await svcAuth.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!["super_admin", "admin"].includes((profile as { role?: string } | null)?.role ?? "")) {
      return json(403, { ok: false, error: "Requires admin role" });
    }
    const body = await req.json().catch(() => ({}));
    runNowScheduleId = typeof body?.schedule_id === "string" ? body.schedule_id : null;
    if (!runNowScheduleId) return json(400, { ok: false, error: "schedule_id required for a manual run" });
  }

  const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

  try {
    let due: ExportSchedule[];
    if (runNowScheduleId) {
      const { data, error } = await svc.from("time_export_schedules").select("*").eq("id", runNowScheduleId).maybeSingle();
      if (error) return json(500, { ok: false, error: error.message });
      if (!data) return json(404, { ok: false, error: "Schedule not found" });
      due = [data as ExportSchedule];
    } else {
      const { data, error } = await svc.from("time_export_schedules").select("*").eq("is_active", true).lte("next_run_at", new Date().toISOString());
      if (error) return json(500, { ok: false, error: error.message });
      due = (data ?? []) as ExportSchedule[];
    }

    const results: Record<string, { ok: boolean; error?: string }> = {};
    for (const sched of due) {
      const result = await runSchedule(svc, sched);
      results[sched.id] = result;
      if (result.ok || !runNowScheduleId) {
        // Advance the schedule on a successful send, or on any cron-driven
        // attempt (success or failure) so one bad send doesn't retry every
        // hour forever; a manual "send now" failure leaves next_run_at
        // untouched so the admin can just retry immediately.
        await svc.from("time_export_schedules").update({
          last_run_at: new Date().toISOString(),
          next_run_at: nextRunAt(sched, new Date()).toISOString(),
        }).eq("id", sched.id);
      }
    }

    console.log(`[timetrack-export-runner] processed ${due.length} schedule(s):`, results);
    return json(200, { ok: true, processed: due.length, results });
  } catch (err) {
    console.error("[timetrack-export-runner]", err);
    return json(500, { ok: false, error: "Export runner failed." });
  }
});
