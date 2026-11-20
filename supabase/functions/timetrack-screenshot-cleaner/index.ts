// supabase/functions/timetrack-screenshot-cleaner/index.ts
//
// Removes screenshot image files from the private `timetrack-screenshots` bucket once their time_screenshots row is gone
// (retention purge, the Screenshots page, employee deletion). See migration 20261431000200_screenshot_storage_cleanup.sql.
//
// Default run: drain storage_delete_queue (filled by a trigger on time_screenshots), at most `limit` files per run
// (default 1000, hard cap 5000), in Storage API batches of 100. A queued path is only removed if no time_screenshots row
// still references it and it has the expected `<employee uuid>/<name>` shape.
//
// Body { "sweep_orphans": true }: instead removes files that have NO row at all (left behind before this cleaner existed,
// or uploads whose row insert failed), via timetrack_orphan_screenshot_objects() (files older than 2 days only). Not
// scheduled; run it by hand until the report count reaches 0.
//
// AUTH: X-Cron-Secret == CRON_SHARED_SECRET (pg_cron tick, same secret as batch-worker). No user path.
//
// Deploy: supabase functions deploy timetrack-screenshot-cleaner --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { getCorsHeaders } from "../_shared/cors.ts";
import { constantTimeEquals } from "../_shared/timing.ts";
import {
  MAX_ATTEMPTS, SCREENSHOT_BUCKET, STORAGE_BATCH, chunk, clampLimit, isSafeScreenshotPath, planCleanup,
  type QueueRow,
} from "../_shared/screenshot-cleanup-core.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    if (!constantTimeEquals(req.headers.get("X-Cron-Secret"), Deno.env.get("CRON_SHARED_SECRET"))) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const limit = clampLimit((body as any)?.limit);

    // ─── Orphan sweep (manual) ───────────────────────────────────────────
    if ((body as any)?.sweep_orphans === true) {
      const { data, error } = await svc.rpc("timetrack_orphan_screenshot_objects", { p_limit: limit });
      if (error) throw error;
      const names = ((data ?? []) as { name: string }[]).map((r) => r.name).filter(isSafeScreenshotPath);
      let removed = 0;
      let failedBatches = 0;
      for (const part of chunk(names, STORAGE_BATCH)) {
        const { data: gone, error: rmErr } = await svc.storage.from(SCREENSHOT_BUCKET).remove(part);
        if (rmErr) { failedBatches++; console.error("[screenshot-cleaner] orphan remove failed:", rmErr.message); continue; }
        removed += gone?.length ?? 0;
      }
      return json({ ok: true, mode: "sweep_orphans", considered: names.length, removed, failed_batches: failedBatches });
    }

    // ─── Drain the queue ─────────────────────────────────────────────────
    const { data: queued, error: qErr } = await svc
      .from("storage_delete_queue")
      .select("id, path, attempts")
      .eq("bucket", SCREENSHOT_BUCKET)
      .lt("attempts", MAX_ATTEMPTS)
      .order("id", { ascending: true })
      .limit(limit);
    if (qErr) throw qErr;

    let removed = 0;
    let dropped = 0;
    let failed = 0;
    for (const part of chunk((queued ?? []) as QueueRow[], STORAGE_BATCH)) {
      // Is any row still pointing at one of these files? Then the file must stay.
      const { data: refs, error: refErr } = await svc
        .from("time_screenshots").select("storage_path").in("storage_path", part.map((q) => q.path));
      if (refErr) { failed += part.length; console.error("[screenshot-cleaner] reference check failed:", refErr.message); continue; }
      const plan = planCleanup(part, new Set(((refs ?? []) as { storage_path: string }[]).map((r) => r.storage_path)));

      if (plan.drop.length > 0) {
        await svc.from("storage_delete_queue").delete().in("id", plan.drop.map((q) => q.id));
        dropped += plan.drop.length;
      }
      if (plan.remove.length === 0) continue;

      const { error: rmErr } = await svc.storage.from(SCREENSHOT_BUCKET).remove(plan.remove.map((q) => q.path));
      if (rmErr) {
        failed += plan.remove.length;
        for (const q of plan.remove) {
          await svc.from("storage_delete_queue")
            .update({ attempts: (q.attempts ?? 0) + 1, last_error: rmErr.message.slice(0, 300) }).eq("id", q.id);
        }
        continue;
      }
      // Storage reports success whether or not the object still existed, so the queue rows are done either way.
      await svc.from("storage_delete_queue").delete().in("id", plan.remove.map((q) => q.id));
      removed += plan.remove.length;
    }

    return json({ ok: true, mode: "drain_queue", considered: queued?.length ?? 0, removed, dropped, failed });
  } catch (err) {
    console.error("[timetrack-screenshot-cleaner]", err);
    return json({ ok: false, error: "Screenshot cleanup failed. Please try again later." }, 500);
  }
});
