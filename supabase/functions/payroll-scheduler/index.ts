// supabase/functions/payroll-scheduler/index.ts
//
// Auto-scheduled payroll: generates draft payroll runs when a pay schedule's
// processing window opens, and notifies Finance / Admin.
//
// Registered via 20261025000000_payroll_scheduler_cron.sql (pg_cron, daily
// 06:00 UTC tick through Vault-stored URL + shared secret — same pattern as
// batch-worker / fx-rate-sync). Previously this function had no actual cron
// registration anywhere, so it only ever ran if invoked by hand.
//
// AUTH (deployed --no-verify-jwt, validated in code):
//   • X-Cron-Secret == CRON_SHARED_SECRET   (pg_cron daily tick), or
//   • a Supabase JWT for a super_admin / admin / finance user (manual run).
//
// Deploy: supabase functions deploy payroll-scheduler --no-verify-jwt
// Secrets: CRON_SHARED_SECRET (already set for batch-worker — reused).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY    = Deno.env.get("SUPABASE_ANON_KEY")!;
const CRON_SHARED_SECRET   = Deno.env.get("CRON_SHARED_SECRET");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ── Auth gate ────────────────────────────────────────────────────────────
  const isCron = !!CRON_SHARED_SECRET && req.headers.get("X-Cron-Secret") === CRON_SHARED_SECRET;
  if (!isCron) {
    const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!bearer) return json(401, { ok: false, error: "Not authenticated" });
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: { user }, error: authErr } = await anon.auth.getUser(bearer);
    if (authErr || !user) return json(401, { ok: false, error: authErr?.message ?? "Not authenticated" });
    const svcCheck = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
    const { data: profile } = await svcCheck.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!["super_admin", "admin", "finance"].includes((profile as any)?.role)) {
      return json(403, { ok: false, error: "Requires admin or finance role" });
    }
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  try {
    // ── Step 1: call the DB-side RPC that creates draft runs ─────────────────
    const { data: draftsCreated, error: draftError } = await supabase
      .rpc("schedule_auto_draft");

    if (draftError) {
      console.error("[payroll-scheduler] schedule_auto_draft error:", draftError.message);
      return new Response(JSON.stringify({ ok: false, error: draftError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const created = Number(draftsCreated ?? 0);
    console.log(`[payroll-scheduler] Drafts created: ${created}`);

    // ── Step 2: notify Finance / Admin of newly generated drafts ─────────────
    if (created > 0) {
      await notifyNewDrafts(supabase);
    }

    // ── Step 3: send upcoming-payroll reminder for runs in their window ───────
    await sendProcessingReminders(supabase);

    return new Response(
      JSON.stringify({ ok: true, drafts_created: created, ts: new Date().toISOString() }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[payroll-scheduler] unexpected error:", err?.message);
    return new Response(JSON.stringify({ ok: false, error: err?.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function notifyNewDrafts(supabase: ReturnType<typeof createClient>) {
  // Fetch the auto-generated draft runs created today
  const today = new Date().toISOString().slice(0, 10);
  const { data: runs } = await supabase
    .from("payroll_runs")
    .select("id, period, pay_date, pay_schedule_id, pay_schedules(name)")
    .eq("is_auto_generated", true)
    .eq("status", "draft")
    .gte("created_at", today + "T00:00:00Z")
    .lte("created_at", today + "T23:59:59Z");

  if (!runs?.length) return;

  // Fetch Finance / Admin / Super-admin profiles for in-app notifications
  const { data: recipients } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("role", ["super_admin", "admin", "finance"])
    .eq("status", "active");

  if (!recipients?.length) return;

  for (const run of runs) {
    const scheduleName = (run.pay_schedules as any)?.name ?? "Pay Schedule";
    const period = formatPeriod(run.period);
    const payDate = run.pay_date ? formatDate(run.pay_date) : "";
    const title = `Payroll draft ready — ${period}`;
    const body = `A payroll draft for ${period} was auto-generated by the "${scheduleName}" schedule. Pay date: ${payDate}. Please review and approve.`;

    const notifications = recipients.map((r: any) => ({
      user_id: r.id,
      title,
      body,
      type: "payroll",
      link: `/payroll?run=${run.id}`,
      is_read: false,
    }));

    const { error } = await supabase.from("notifications").insert(notifications);
    if (error) console.warn("[payroll-scheduler] notification insert error:", error.message);
  }
}

async function sendProcessingReminders(supabase: ReturnType<typeof createClient>) {
  // Remind Finance 1 day before cutoff_date for pending_approval runs
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const { data: runs } = await supabase
    .from("payroll_runs")
    .select("id, period, pay_date, cutoff_date")
    .eq("status", "draft")
    .eq("cutoff_date", tomorrowStr);

  if (!runs?.length) return;

  const { data: recipients } = await supabase
    .from("profiles")
    .select("id")
    .in("role", ["super_admin", "admin", "finance"])
    .eq("status", "active");

  if (!recipients?.length) return;

  for (const run of runs) {
    const period = formatPeriod(run.period);
    const payDate = run.pay_date ? formatDate(run.pay_date) : "";

    const notifications = recipients.map((r: any) => ({
      user_id: r.id,
      title: `⏰ Payroll cutoff tomorrow — ${period}`,
      body: `The payroll data cutoff for ${period} is tomorrow. After cutoff, no further changes can be made. Pay date: ${payDate}.`,
      type: "payroll",
      link: `/payroll?run=${run.id}`,
      is_read: false,
    }));

    await supabase.from("notifications").insert(notifications);
  }
}

function formatPeriod(period: string): string {
  const [y, m] = period.split("-");
  const d = new Date(parseInt(y), parseInt(m) - 1, 1);
  return d.toLocaleString("en-GB", { month: "long", year: "numeric" });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
