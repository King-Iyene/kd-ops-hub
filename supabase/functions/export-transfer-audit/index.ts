// supabase/functions/export-transfer-audit/index.ts
//
// Exports transfer_audit rows as a CSV file. Requires a valid Supabase JWT
// from a caller whose profile role is super_admin, admin, or finance.
//
// Query parameters (all optional):
//   start_date   ISO date string — include rows where created_at >= start_date
//   end_date     ISO date string — include rows where created_at <= end_date + 1 day
//   action_type  all | transfers | cap_changes | denials  (default: all)
//   limit        max rows to return, default 5000, capped at 10000
//
// Deploy:
//   supabase functions deploy export-transfer-audit --no-verify-jwt
//
// Env required:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { getCorsHeaders } from "../_shared/cors.ts";

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

/**
 * Escapes a single CSV field value.
 * Wraps in double-quotes when the value contains a comma, double-quote, or
 * newline. Any internal double-quote characters are doubled.
 */
function csvField(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildCsvRow(fields: unknown[]): string {
  return fields.map(csvField).join(",");
}

// ---------------------------------------------------------------------------
// JSON response helper
// ---------------------------------------------------------------------------

function jsonResponse(
  body: unknown,
  status: number,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS pre-flight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // -----------------------------------------------------------------------
    // 1. Authenticate — require a valid Supabase JWT
    // -----------------------------------------------------------------------
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonResponse(
        { error: "Missing or malformed Authorization header" },
        401,
        corsHeaders,
      );
    }

    const jwt = authHeader.replace("Bearer ", "");

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { auth: { persistSession: false } },
    );

    const {
      data: { user },
      error: authError,
    } = await anonClient.auth.getUser(jwt);

    if (authError || !user) {
      return jsonResponse(
        { error: authError?.message ?? "Not authenticated" },
        401,
        corsHeaders,
      );
    }

    // -----------------------------------------------------------------------
    // 2. Authorise — check role via service client (bypasses RLS)
    // -----------------------------------------------------------------------
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: profile, error: profileError } = await serviceClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError) {
      return jsonResponse(
        { error: `Failed to fetch profile: ${profileError.message}` },
        500,
        corsHeaders,
      );
    }

    const callerRole: string = profile?.role ?? "";
    const ALLOWED_ROLES = new Set(["super_admin", "admin", "finance"]);

    if (!ALLOWED_ROLES.has(callerRole)) {
      return jsonResponse(
        { error: "Insufficient permissions" },
        403,
        corsHeaders,
      );
    }

    // -----------------------------------------------------------------------
    // 3. Parse query parameters
    // -----------------------------------------------------------------------
    const url = new URL(req.url);
    const params = url.searchParams;

    const startDate = params.get("start_date") ?? null;
    const endDate = params.get("end_date") ?? null;
    const actionType = (params.get("action_type") ?? "all").toLowerCase();
    const rawLimit = parseInt(params.get("limit") ?? "5000", 10);
    const limit = isNaN(rawLimit) ? 5000 : Math.min(Math.max(rawLimit, 1), 10000);

    // Validate action_type
    const VALID_ACTION_TYPES = new Set(["all", "transfers", "cap_changes", "denials"]);
    if (!VALID_ACTION_TYPES.has(actionType)) {
      return jsonResponse(
        { error: `Invalid action_type. Must be one of: all, transfers, cap_changes, denials` },
        400,
        corsHeaders,
      );
    }

    // -----------------------------------------------------------------------
    // 4. Build and execute query against transfer_audit (via service client)
    // -----------------------------------------------------------------------
    let query = serviceClient
      .from("transfer_audit")
      .select(
        `
        id,
        created_at,
        actor_id,
        actor_role,
        action,
        outcome,
        amount_ngn,
        reference,
        ip_hash,
        reason,
        metadata,
        profiles ( full_name )
        `,
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    // Date filters
    if (startDate) {
      query = query.gte("created_at", startDate);
    }
    if (endDate) {
      // Include the full end day by adding 1 day
      const endPlusOne = new Date(endDate);
      endPlusOne.setUTCDate(endPlusOne.getUTCDate() + 1);
      query = query.lte("created_at", endPlusOne.toISOString());
    }

    // action_type filter
    switch (actionType) {
      case "transfers":
        query = query.in("action", ["initiate_transfer", "bulk_transfer"]);
        break;
      case "cap_changes":
        query = query.eq("action", "cap_changed");
        break;
      case "denials":
        query = query.in("outcome", ["denied", "error"]);
        break;
      case "all":
      default:
        // No additional filter
        break;
    }

    const { data: rows, error: queryError } = await query;

    if (queryError) {
      return jsonResponse(
        { error: `Query failed: ${queryError.message}` },
        500,
        corsHeaders,
      );
    }

    // -----------------------------------------------------------------------
    // 5. Build CSV
    // -----------------------------------------------------------------------
    const CSV_HEADER = "timestamp,actor,actor_role,action,outcome,amount_ngn,reference,ip_hash_last6,reason,metadata_summary";

    const csvLines: string[] = [CSV_HEADER];

    for (const row of (rows ?? []) as any[]) {
      const ipHashLast6: string = row.ip_hash
        ? String(row.ip_hash).slice(-6)
        : "";

      const rawMetadata = row.metadata != null
        ? JSON.stringify(row.metadata)
        : "";
      const metadataSummary: string = rawMetadata.length > 200
        ? rawMetadata.slice(0, 200)
        : rawMetadata;

      // profiles is the joined object; Supabase returns it as { full_name: string | null }
      const actorName: string = (row.profiles as any)?.full_name ?? row.actor_id ?? "";

      csvLines.push(
        buildCsvRow([
          row.created_at ?? "",
          actorName,
          row.actor_role ?? "",
          row.action ?? "",
          row.outcome ?? "",
          row.amount_ngn ?? "",
          row.reference ?? "",
          ipHashLast6,
          row.reason ?? "",
          metadataSummary,
        ]),
      );
    }

    const csvBody = csvLines.join("\n");

    // -----------------------------------------------------------------------
    // 6. Return CSV response
    // -----------------------------------------------------------------------
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `transfer-audit-${timestamp}.csv`;

    return new Response(csvBody, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[export-transfer-audit] Unhandled error:", message);
    return jsonResponse({ error: "Export failed. Please try again later." }, 500, corsHeaders);
  }
});
