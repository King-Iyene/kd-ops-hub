// supabase/functions/data-retention-runner/index.ts
//
// Runs cleanup for one or more retention policies.
//
// Flow per policy:
//   1. Skip if all_paused or scheduled_first_run_at > now (still in 7-day delay).
//   2. Compute cutoff = now - retention_days.
//   3. Fetch matching rows from the source table.
//   4. If mode='archive' or 'archive_delete', upload a JSON file to the
//      archives/ bucket: archives/{data_type}/{YYYY-MM-DD}-{run_id}.json
//   5. If mode='archive_delete', delete the source rows in chunks.
//   6. Insert one row in retention_runs with status / counts / archive path.
//
// Auth:
//   Manual call (admin clicks "Run now") — JWT from client; verified to be
//     admin/super_admin.
//   Scheduled call (Supabase pg_cron / external cron) — pass the
//     SUPABASE_SERVICE_ROLE_KEY as the bearer; mode='scheduled' bypasses
//     user check but ALL writes still go through service role.
//
// Deploy:
//   supabase functions deploy data-retention-runner --no-verify-jwt
//
// IMPORTANT: this function NEVER touches the documents table or
// employee files. The data_type whitelist is enforced both in the DB
// constraint and here.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_TYPES = new Set(["audit_logs", "notifications", "receipts"]);

interface SourceConfig {
  table: string;
  dateColumn: string;
  /** Extra filter for cleanup safety (e.g. only deletable rows). */
  extraFilter?: (q: any) => any;
}

const SOURCES: Record<string, SourceConfig> = {
  audit_logs:    { table: "audit_logs",    dateColumn: "created_at" },
  notifications: {
    table: "notifications",
    dateColumn: "created_at",
    // Never delete unread notifications.
    extraFilter: (q) => q.eq("read", true),
  },
  // For receipts/files, the "row" we archive is the storage object's
  // metadata. Cleanup is driven by associated DB rows (expenses,
  // fuel_requests) but the actual delete lives in storage.objects.
  receipts: { table: "expenses", dateColumn: "created_at" },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const service = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const { policy_id } = body as { policy_id?: string };

    // ── Authorize: service-role bearer for scheduled runs, otherwise
    //    require a valid JWT from an admin/super_admin user. ──────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.replace("Bearer ", "");
    const isServiceRole = bearer && bearer === SERVICE_ROLE;

    let triggeredBy: string | null = null;
    if (!isServiceRole) {
      const userClient = createClient(
        SUPABASE_URL,
        Deno.env.get("SUPABASE_ANON_KEY")!,
      );
      const { data: { user } } = await userClient.auth.getUser(bearer);
      if (!user) {
        return json({ error: "Not authenticated" }, 401);
      }
      const { data: profile } = await service
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      if (!profile || !["admin", "super_admin"].includes((profile as any).role)) {
        return json({ error: "Insufficient permissions" }, 403);
      }
      triggeredBy = user.id;
    }

    // ── Pick policies to run ─────────────────────────────────────────────
    let policiesQ = service
      .from("retention_policies")
      .select("*")
      .eq("all_paused", false)
      .neq("mode", "off");
    if (policy_id) policiesQ = policiesQ.eq("id", policy_id);

    const { data: policies, error: policiesErr } = await policiesQ;
    if (policiesErr) throw policiesErr;
    if (!policies || policies.length === 0) {
      return json({ ok: true, processed: 0, message: "No active policies." });
    }

    const results: any[] = [];
    const now = new Date();

    for (const p of policies as any[]) {
      // Whitelist guard (defence in depth — DB constraint already enforces).
      if (!ALLOWED_TYPES.has(p.data_type)) {
        results.push({ policy: p.id, skipped: "disallowed data_type" });
        continue;
      }
      // 7-day delay enforced at the policy level.
      if (p.scheduled_first_run_at && new Date(p.scheduled_first_run_at) > now) {
        results.push({ policy: p.id, skipped: "still in scheduled delay" });
        continue;
      }

      const cfg = SOURCES[p.data_type];
      const cutoff = new Date(now.getTime() - p.retention_days * 24 * 60 * 60 * 1000);

      // Insert run row up front so we can update it as we progress.
      const { data: run } = await service
        .from("retention_runs")
        .insert({
          policy_id:    p.id,
          data_type:    p.data_type,
          mode:         p.mode,
          cutoff_date:  cutoff.toISOString(),
          status:       "running",
          triggered_by: triggeredBy,
        })
        .select("*")
        .single();

      try {
        // 1. Fetch rows in scope (paginated).
        let query = service
          .from(cfg.table)
          .select("*")
          .lt(cfg.dateColumn, cutoff.toISOString())
          .order(cfg.dateColumn, { ascending: true })
          .limit(5000);
        if (cfg.extraFilter) query = cfg.extraFilter(query);
        const { data: rows, error: fetchErr } = await query;
        if (fetchErr) throw fetchErr;

        const archived = rows?.length ?? 0;
        let deleted = 0;
        let archivePath: string | null = null;

        if (archived > 0 && (p.mode === "archive" || p.mode === "archive_delete")) {
          // 2. Write archive JSON.
          const dateStamp = now.toISOString().slice(0, 10);
          archivePath = `${p.data_type}/${dateStamp}-${(run as any)?.id || "manual"}.json`;
          const payload = JSON.stringify({
            data_type: p.data_type,
            cutoff: cutoff.toISOString(),
            generated_at: now.toISOString(),
            row_count: archived,
            rows,
          }, null, 2);
          const { error: upErr } = await service.storage
            .from("archives")
            .upload(archivePath, new Blob([payload], { type: "application/json" }), {
              upsert: false,
              contentType: "application/json",
            });
          if (upErr) throw upErr;
        }

        // 3. Delete source rows (only if archive_delete and archive succeeded).
        if (archived > 0 && p.mode === "archive_delete" && archivePath) {
          const ids = (rows || []).map((r: any) => r.id);
          // audit_logs / transfer_audit are append-only at the DB level
          // (immutability trigger). Use the purge RPC, which flips the
          // session GUC inside a security-definer function so the DELETE
          // is allowed for this single call.
          const isAudit = cfg.table === "audit_logs" || cfg.table === "transfer_audit";
          for (let i = 0; i < ids.length; i += 500) {
            const chunk = ids.slice(i, i + 500);
            if (isAudit) {
              const { data: deletedCount, error: rpcErr } = await service.rpc(
                "purge_audit_rows",
                { p_table: cfg.table, p_ids: chunk },
              );
              if (rpcErr) throw rpcErr;
              deleted += Number(deletedCount ?? chunk.length);
            } else {
              const { error: delErr } = await service
                .from(cfg.table)
                .delete()
                .in("id", chunk);
              if (delErr) throw delErr;
              deleted += chunk.length;
            }
          }
        }

        // 4. Mark run successful.
        await service.from("retention_runs").update({
          completed_at:   new Date().toISOString(),
          items_archived: archived,
          items_deleted:  deleted,
          archive_path:   archivePath,
          status:         "success",
        }).eq("id", (run as any).id);

        await service.from("retention_policies").update({
          last_run_at:     new Date().toISOString(),
          last_run_count:  archived,
          last_run_status: "success",
        }).eq("id", p.id);

        results.push({
          policy: p.id,
          data_type: p.data_type,
          archived,
          deleted,
          archive_path: archivePath,
        });
      } catch (e: any) {
        await service.from("retention_runs").update({
          completed_at:  new Date().toISOString(),
          status:        "failed",
          error_message: e?.message || String(e),
        }).eq("id", (run as any).id);
        await service.from("retention_policies").update({
          last_run_at:     new Date().toISOString(),
          last_run_status: "failed",
        }).eq("id", p.id);
        results.push({ policy: p.id, error: e?.message || String(e) });
      }
    }

    return json({ ok: true, processed: results.length, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ ok: false, error: message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
