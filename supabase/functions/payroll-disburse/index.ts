// supabase/functions/payroll-disburse/index.ts
//
// Turns an approved payroll run into a dispatched payment batch. Single
// code path for BOTH:
//   • Manual "Disburse Now" (Payroll.tsx) — body: { run_id }, user JWT.
//   • Scheduled disbursement (cron tick, every minute) — no body, finds
//     every approved run whose scheduled_disburse_at has passed.
//
// Pipeline per run:
//   1. create_payroll_disbursement_batch RPC — claims the run (row-locked,
//      approved -> processing), creates payment_batches + batch_items.
//      Employees missing bank details are skipped, not fatal.
//   2. Hand the batch to the batch-worker edge function (the same dispatch
//      engine every other batch type already uses — no separate/duplicate
//      transfer logic here) via its cron-secret path.
//   3. finalize_payroll_run_disbursement — releases the lock: 'paid' if
//      anything dispatched, 'approved' (retryable) otherwise.
//   4. scheduled_disburse_at is always cleared after an attempt so a
//      failed scheduled run does NOT silently retry forever — it notifies
//      Finance/Admin instead and waits for a human to act.
//
// AUTH:
//   • X-Cron-Secret == CRON_SHARED_SECRET (pg_cron tick), or
//   • a Supabase JWT for a super_admin / admin / finance user (manual run).
//
// Deploy: supabase functions deploy payroll-disburse --no-verify-jwt
// Secrets: CRON_SHARED_SECRET (already set — reused from batch-worker).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// Inlined from ../_shared/cors.ts and ../_shared/timing.ts to avoid relative
// import path resolution issues in the deploy bundler.
const PROD_ORIGINS = ["https://ops.kdsquares.com"];
const LOCAL_ORIGINS = ["http://localhost:5173", "http://localhost:8080", "http://localhost:3000"];
function denyLocalhost(): boolean {
  try { return Deno.env.get("KDOPS_CORS_DENY_LOCALHOST") === "1"; } catch { return false; }
}
const ALLOWED_ORIGINS = denyLocalhost() ? [...PROD_ORIGINS] : [...PROD_ORIGINS, ...LOCAL_ORIGINS];
function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-cron-secret, x-fw-secret-hash, x-paystack-signature, verif-hash",
  };
}
function constantTimeEquals(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (!provided || !expected) return false;
  if (provided.length !== expected.length) return false;
  const enc = new TextEncoder();
  const a = enc.encode(provided);
  const b = enc.encode(expected);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY    = Deno.env.get("SUPABASE_ANON_KEY")!;
const CRON_SHARED_SECRET   = Deno.env.get("CRON_SHARED_SECRET");

interface DisburseResult {
  run_id: string;
  ok: boolean;
  batch_id?: string;
  dispatched?: number;
  failed?: number;
  skipped?: unknown[];
  error?: string;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const isCron = constantTimeEquals(req.headers.get("X-Cron-Secret"), CRON_SHARED_SECRET);

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

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body OK — cron tick */ }

  try {
    let runIds: string[];
    if (body?.run_id) {
      runIds = [String(body.run_id)];
    } else {
      // Cron sweep: every approved run whose scheduled time has arrived.
      const { data: dueRuns, error: dueErr } = await supabase
        .from("payroll_runs")
        .select("id")
        .eq("status", "approved")
        .not("scheduled_disburse_at", "is", null)
        .lte("scheduled_disburse_at", new Date().toISOString());
      if (dueErr) throw dueErr;
      runIds = (dueRuns ?? []).map((r: any) => r.id);
      if (runIds.length === 0) {
        return json(200, { ok: true, processed: 0, results: [] });
      }
    }

    const results: DisburseResult[] = [];
    for (const runId of runIds) {
      results.push(await disburseOne(supabase, runId));
    }

    return json(200, { ok: true, processed: results.length, results });
  } catch (err: any) {
    console.error("[payroll-disburse] unexpected error:", err?.message);
    return json(500, { ok: false, error: err?.message ?? "Unexpected error" });
  }
});

async function disburseOne(
  supabase: ReturnType<typeof createClient>,
  runId: string,
): Promise<DisburseResult> {
  // Always clear the schedule up front for this attempt — a scheduled run
  // gets exactly one automatic attempt. If it fails, it needs a human to
  // look at it and re-approve/reschedule, not a silent infinite retry loop
  // with real money involved.
  await supabase
    .from("payroll_runs")
    .update({ scheduled_disburse_at: null })
    .eq("id", runId)
    .eq("status", "approved");

  const { data: batchResult, error: batchErr } = await supabase.rpc(
    "create_payroll_disbursement_batch",
    { p_run_id: runId },
  );

  if (batchErr) {
    // Could not even claim the run (already processing/paid, or a real
    // error) — nothing was created, nothing to release.
    await notifyOutcome(supabase, runId, { ok: false, error: batchErr.message });
    return { run_id: runId, ok: false, error: batchErr.message };
  }

  const batchId = (batchResult as any)?.batch_id as string | undefined;
  const skipped = (batchResult as any)?.skipped ?? [];
  const itemCount = Number((batchResult as any)?.item_count ?? 0);

  if (!batchId || itemCount === 0) {
    // Every employee was skipped (missing bank details) or there are no
    // payslips at all — release the lock back to 'approved' so it isn't
    // stuck in 'processing', and make sure someone knows why nothing went out.
    await supabase.rpc("finalize_payroll_run_disbursement", { p_run_id: runId, p_new_status: "approved" });
    await notifyOutcome(supabase, runId, { ok: false, error: "No employees had usable bank details", skipped });
    return { run_id: runId, ok: false, error: "No employees had usable bank details", skipped };
  }

  // Hand off to the same dispatch engine every other batch type uses.
  let dispatched = 0;
  let failed = 0;
  let workerError: string | null = null;
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/batch-worker`, {
      method: "POST",
      headers: {
        "X-Cron-Secret": CRON_SHARED_SECRET ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ batch_id: batchId }),
      signal: AbortSignal.timeout(30_000),
    });
    const workerJson = await resp.json().catch(() => ({}));
    if (!resp.ok || workerJson?.ok === false) {
      workerError = workerJson?.error ?? `batch-worker HTTP ${resp.status}`;
    } else {
      dispatched = Number(workerJson?.dispatched ?? 0);
      failed = Number(workerJson?.failed ?? 0);
    }
  } catch (err: any) {
    workerError = err?.message ?? "batch-worker call failed";
  }

  // Release the processing lock. 'paid' if at least one transfer was
  // dispatched (batch-worker's own finalize_batch RPC keeps refining the
  // batch's own status as items settle) — 'approved' so a total failure
  // can be retried by a human via the normal "Disburse Now" button.
  await supabase.rpc("finalize_payroll_run_disbursement", {
    p_run_id: runId,
    p_new_status: dispatched > 0 ? "paid" : "approved",
  });

  const outcome = {
    ok: dispatched > 0,
    batch_id: batchId,
    dispatched,
    failed,
    skipped,
    error: dispatched === 0 ? (workerError ?? "No transfers dispatched") : undefined,
  };
  await notifyOutcome(supabase, runId, outcome);
  return { run_id: runId, ...outcome };
}

async function notifyOutcome(
  supabase: ReturnType<typeof createClient>,
  runId: string,
  outcome: { ok: boolean; batch_id?: string; dispatched?: number; failed?: number; skipped?: unknown[]; error?: string },
) {
  const { data: run } = await supabase
    .from("payroll_runs")
    .select("period")
    .eq("id", runId)
    .maybeSingle();
  const period = (run as any)?.period ?? runId;

  const { data: recipients } = await supabase
    .from("profiles")
    .select("id")
    .in("role", ["super_admin", "admin", "finance"])
    .eq("status", "active");
  if (!recipients?.length) return;

  const skippedCount = Array.isArray(outcome.skipped) ? outcome.skipped.length : 0;
  const title = outcome.ok
    ? `Payroll disbursed — ${period}`
    : `⚠️ Payroll disbursement needs attention — ${period}`;
  const body = outcome.ok
    ? `${outcome.dispatched} transfer${outcome.dispatched === 1 ? "" : "s"} initiated for ${period}.${skippedCount ? ` ${skippedCount} employee${skippedCount === 1 ? "" : "s"} skipped (missing bank details).` : ""}${outcome.failed ? ` ${outcome.failed} failed and need review.` : ""}`
    : `Scheduled disbursement for ${period} did not complete: ${outcome.error ?? "unknown error"}.${skippedCount ? ` ${skippedCount} employee${skippedCount === 1 ? "" : "s"} skipped (missing bank details).` : ""} The run is back in "Approved" — review and disburse manually.`;

  const notifications = recipients.map((r: any) => ({
    user_id: r.id,
    title,
    body,
    type: "payroll",
    link: `/payroll?run=${runId}`,
    is_read: false,
  }));
  const { error } = await supabase.from("notifications").insert(notifications);
  if (error) console.warn("[payroll-disburse] notification insert error:", error.message);
}
