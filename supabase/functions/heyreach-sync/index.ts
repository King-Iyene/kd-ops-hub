// supabase/functions/heyreach-sync/index.ts
//
// Read-only sync of HeyReach LinkedIn sender-account health onto contractors.
//
// For each contractor with a LinkedIn Email (contractors.heyreach_email) we
// look up the matching HeyReach sender account and record:
//   heyreach_status: 'active'      (authIsValid = true)
//                  | 'disconnected' (authIsValid = false)
//                  | 'unmatched'    (no HeyReach account found for that email)
//   heyreach_auth_valid, heyreach_active_campaigns, heyreach_account_id, heyreach_synced_at
//
// The team's manual lifecycle column `contractors.status` is NEVER modified.
//
// SAFETY (this function must not disrupt HeyReach or KDOps):
//   • Read-only against HeyReach (CheckApiKey + paginated GetAll only).
//   • Validates the API key first; on ANY HeyReach error it logs the run as
//     failed and returns WITHOUT touching a single contractor row. A failed
//     sync is a no-op, never data corruption.
//   • All network calls have timeouts + bounded retry with backoff (HeyReach
//     occasionally returns 502s).
//
// AUTH: deployed with --no-verify-jwt; validated in code. Accepts either
//   • X-Cron-Secret header == CRON_SHARED_SECRET   (pg_cron), or
//   • a Supabase JWT belonging to a super_admin / admin / finance user (manual
//     "Sync HeyReach Now" button / pre-batch sync).
//
// Deploy:  supabase functions deploy heyreach-sync --no-verify-jwt
// Secrets: supabase secrets set HEYREACH_API_KEY=...
//          (CRON_SHARED_SECRET already set for batch-worker — reused.)
//          Optional: HEYREACH_API_BASE (default https://api.heyreach.io/api/public)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL          = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;
const HEYREACH_API_KEY      = Deno.env.get("HEYREACH_API_KEY");
const HEYREACH_API_BASE     = (Deno.env.get("HEYREACH_API_BASE") ?? "https://api.heyreach.io/api/public").replace(/\/$/, "");
const CRON_SHARED_SECRET    = Deno.env.get("CRON_SHARED_SECRET");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface HeyReachAccount {
  id: number;
  emailAddress: string | null;
  firstName: string | null;
  lastName: string | null;
  isActive: boolean;
  activeCampaigns: number;
  authIsValid: boolean;
}

// fetch with timeout + bounded retry on network errors / 5xx (HeyReach 502s).
async function fetchWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(timer);
      if (res.status >= 500 && i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
  throw lastErr ?? new Error("fetch failed");
}

const hrHeaders = { "X-API-KEY": HEYREACH_API_KEY ?? "", "Content-Type": "application/json" };

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // ── Auth gate ──────────────────────────────────────────────────────────────
  const cronSecret = req.headers.get("X-Cron-Secret");
  const isCron = !!CRON_SHARED_SECRET && cronSecret === CRON_SHARED_SECRET;

  let triggeredBy = "cron";
  try {
    const peek = await req.clone().json().catch(() => ({}));
    if (peek?.triggered_by) triggeredBy = String(peek.triggered_by);
  } catch (_) { /* no body */ }

  if (!isCron) {
    const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!bearer) return json(401, { ok: false, error: "Not authenticated" });
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: { user }, error: authErr } = await anon.auth.getUser(bearer);
    if (authErr || !user) return json(401, { ok: false, error: authErr?.message ?? "Not authenticated" });

    const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
    const { data: profile } = await svc
      .from("profiles").select("role").eq("id", user.id).maybeSingle();
    const role = (profile as any)?.role;
    if (!["super_admin", "admin", "finance"].includes(role)) {
      return json(403, { ok: false, error: "Requires admin or finance role" });
    }
    if (triggeredBy === "cron") triggeredBy = "manual";
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  const startedAt = new Date().toISOString();

  // helper to persist the run outcome and respond
  const finish = async (
    ok: boolean,
    fields: Record<string, unknown>,
    httpStatus = 200,
  ) => {
    try {
      await supabase.from("heyreach_sync_log").insert({
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        ok,
        triggered_by: triggeredBy,
        ...fields,
      });
    } catch (e) {
      console.error("[heyreach-sync] failed to write sync log:", (e as Error)?.message);
    }
    return json(httpStatus, { ok, triggered_by: triggeredBy, ...fields });
  };

  // ── Config guard ─────────────────────────────────────────────────────────
  if (!HEYREACH_API_KEY) {
    console.warn("[heyreach-sync] HEYREACH_API_KEY not set — skipping");
    return finish(false, { error: "HEYREACH_API_KEY not configured" });
  }

  try {
    // ── 1. Validate the API key (confirmed-working endpoint). On failure we
    //       stop here and touch NO contractor data. ───────────────────────────
    const check = await fetchWithRetry(`${HEYREACH_API_BASE}/auth/CheckApiKey`, {
      method: "GET",
      headers: hrHeaders,
    });
    if (!check.ok) {
      return finish(false, {
        error: `HeyReach CheckApiKey failed (HTTP ${check.status}) — sync skipped, no data changed`,
      });
    }

    // ── 2. Fetch all HeyReach sender accounts (paginated). ───────────────────
    const accounts: HeyReachAccount[] = [];
    const pageSize = 100;
    let offset = 0;
    let total = Infinity;
    let guard = 0;
    while (offset < total && guard < 200) {
      guard++;
      const res = await fetchWithRetry(`${HEYREACH_API_BASE}/linkedinaccount/GetAll`, {
        method: "POST",
        headers: hrHeaders,
        body: JSON.stringify({ offset, limit: pageSize }),
      });
      if (!res.ok) {
        return finish(false, {
          accounts_fetched: accounts.length,
          error: `HeyReach GetAll failed (HTTP ${res.status}) at offset ${offset} — sync aborted, no data changed`,
        });
      }
      const page = await res.json().catch(() => null);
      if (!page || !Array.isArray(page.items)) {
        return finish(false, {
          accounts_fetched: accounts.length,
          error: "HeyReach GetAll returned unexpected shape — sync aborted, no data changed",
        });
      }
      total = Number(page.totalCount ?? page.items.length);
      accounts.push(...page.items);
      if (page.items.length < pageSize) break;
      offset += pageSize;
    }

    // index by lowercased email
    const byEmail = new Map<string, HeyReachAccount>();
    for (const a of accounts) {
      if (a.emailAddress) byEmail.set(a.emailAddress.trim().toLowerCase(), a);
    }

    // ── 3. Load contractors that carry a LinkedIn Email. ─────────────────────
    const { data: contractors, error: cErr } = await supabase
      .from("contractors")
      .select("id, full_name, heyreach_email, heyreach_status")
      .not("heyreach_email", "is", null)
      .neq("status", "deleted")
      .neq("is_anonymised", true);
    if (cErr) {
      return finish(false, {
        accounts_fetched: accounts.length,
        error: `Loading contractors failed: ${cErr.message}`,
      });
    }

    const nowIso = new Date().toISOString();
    const changes: Array<{ contractor_id: string; name: string; from: string | null; to: string }> = [];
    let matched = 0, unmatched = 0, updatedCount = 0;
    const unchangedIds: string[] = [];

    for (const c of contractors ?? []) {
      const email = (c as any).heyreach_email?.trim().toLowerCase();
      const acct = email ? byEmail.get(email) : undefined;

      let newStatus: "active" | "disconnected" | "unmatched";
      let authValid: boolean | null = null;
      let activeCampaigns: number | null = null;
      let accountId: number | null = null;

      if (acct) {
        matched++;
        authValid = !!acct.authIsValid;
        activeCampaigns = acct.activeCampaigns ?? 0;
        accountId = acct.id;
        newStatus = authValid ? "active" : "disconnected";
      } else {
        unmatched++;
        newStatus = "unmatched";
      }

      const prev = (c as any).heyreach_status ?? null;
      if (prev !== newStatus) {
        changes.push({ contractor_id: (c as any).id, name: (c as any).full_name, from: prev, to: newStatus });
        const { error: uErr } = await supabase
          .from("contractors")
          .update({
            heyreach_status: newStatus,
            heyreach_auth_valid: authValid,
            heyreach_active_campaigns: activeCampaigns,
            heyreach_account_id: accountId,
            heyreach_synced_at: nowIso,
          })
          .eq("id", (c as any).id);
        if (uErr) {
          console.warn(`[heyreach-sync] update failed for ${(c as any).id}: ${uErr.message}`);
        } else {
          updatedCount++;
        }
      } else {
        unchangedIds.push((c as any).id);
      }
    }

    // Bump synced_at for everything that didn't change status (single statement).
    if (unchangedIds.length) {
      await supabase.from("contractors").update({ heyreach_synced_at: nowIso }).in("id", unchangedIds);
    }

    console.log(`[heyreach-sync] accounts=${accounts.length} matched=${matched} unmatched=${unmatched} changed=${changes.length}`);

    return finish(true, {
      accounts_fetched: accounts.length,
      contractors_checked: contractors?.length ?? 0,
      matched,
      unmatched,
      updated: updatedCount,
      changes,
    });
  } catch (err) {
    return finish(false, { error: (err as Error)?.message ?? String(err) });
  }
});
