// supabase/functions/heyreach-sync/index.ts
//
// Read-only sync of HeyReach LinkedIn sender-account health onto contractors.
//
// For each contractor with a LinkedIn Email (contractors.heyreach_email) OR a
// LinkedIn URL (contractors.linkedin_url) we look up the matching HeyReach
// sender account and record:
//   heyreach_status: 'active'       (authIsValid = true)
//                  | 'disconnected' (authIsValid = false)
//                  | 'unmatched'    (no HeyReach account found)
//   heyreach_auth_valid, heyreach_active_campaigns, heyreach_account_id, heyreach_synced_at
//
// The team's manual lifecycle column `contractors.status` is NEVER modified.
//
// MATCHING: primary key is email (heyreach_email == account.emailAddress,
// case-insensitive). Fallback is a normalised LinkedIn URL match
// (linkedin_url == account.profileUrl). Email is the reliable key — URL only
// matches when both sides use the same URL form.
//
// ENDPOINT DISCOVERY: HeyReach's account-listing path has changed over time and
// their docs are not publicly fetchable, so rather than hard-code one path we
// probe a curated set of candidates and use the first that returns real
// account data. If none work we log every path tried + its HTTP status and
// change NO contractor data. This makes the sync self-healing and safe.
//
// SAFETY: read-only against HeyReach; validates the key first; on ANY HeyReach
// error it logs the run as failed and touches zero contractor rows. Timeouts +
// bounded retry on 5xx (HeyReach occasionally 502s).
//
// AUTH (deployed --no-verify-jwt, validated in code): X-Cron-Secret header ==
// CRON_SHARED_SECRET (pg_cron), OR a Supabase JWT for a super_admin/admin/
// finance user (manual button / pre-batch).
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
  profileUrl?: string | null;
}

const hrHeaders = { "X-API-KEY": HEYREACH_API_KEY ?? "", "Content-Type": "application/json" };

// Candidate (method, path) pairs for the "list LinkedIn accounts" endpoint,
// ordered by likelihood. HeyReach uses a /{resource}/GetAll convention; the
// exact resource name has varied, so we probe. Override the whole thing with
// the HEYREACH_API_BASE secret if a future path needs a different base.
const ACCOUNT_LIST_CANDIDATES: Array<{ method: "POST" | "GET"; path: string }> = [
  { method: "POST", path: "linkedinaccount/GetAll" },
  { method: "POST", path: "li_account/GetAll" },
  { method: "POST", path: "linkedin_account/GetAll" },
  { method: "POST", path: "linkedinaccounts/GetAll" },
  { method: "POST", path: "account/GetAll" },
  { method: "POST", path: "accounts/GetAll" },
  { method: "POST", path: "sender/GetAll" },
  { method: "POST", path: "senders/GetAll" },
  { method: "GET",  path: "linkedinaccount/GetAll" },
  { method: "GET",  path: "linkedinaccount/GetAllLinkedInAccounts" },
];

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

// Does a parsed body look like a HeyReach account-list response?
function isAccountListShape(body: any): boolean {
  const items = Array.isArray(body) ? body : body?.items;
  if (!Array.isArray(items)) return false;
  if (items.length === 0) return true; // empty page from the right endpoint is fine
  const a = items[0] ?? {};
  return "authIsValid" in a || "emailAddress" in a || "profileUrl" in a || "activeCampaigns" in a;
}

function buildUrl(path: string, method: "POST" | "GET", offset: number, limit: number): string {
  const base = `${HEYREACH_API_BASE}/${path}`;
  return method === "GET" ? `${base}?offset=${offset}&limit=${limit}` : base;
}

// Probe candidates with a 1-row request; return the first that yields account data.
async function discoverEndpoint(): Promise<{ method: "POST" | "GET"; path: string } | { error: string }> {
  const tried: string[] = [];
  for (const c of ACCOUNT_LIST_CANDIDATES) {
    try {
      const res = await fetchWithRetry(
        buildUrl(c.path, c.method, 0, 1),
        c.method === "GET"
          ? { method: "GET", headers: hrHeaders }
          : { method: "POST", headers: hrHeaders, body: JSON.stringify({ offset: 0, limit: 1 }) },
        2,
      );
      tried.push(`${c.method} ${c.path} -> ${res.status}`);
      if (res.ok) {
        const body = await res.json().catch(() => null);
        if (isAccountListShape(body)) return { method: c.method, path: c.path };
      }
    } catch (e) {
      tried.push(`${c.method} ${c.path} -> ${(e as Error)?.message ?? "error"}`);
    }
  }
  return { error: `No working accounts endpoint found. Tried: ${tried.join("; ")}` };
}

function normalizeProfileUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let u = url.trim().toLowerCase();
  u = u.replace(/^https?:\/\//, "").replace(/^www\./, "");
  u = u.split(/[?#]/)[0].replace(/\/+$/, "");
  return u || null;
}

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
    if (!["super_admin", "admin", "finance", "operations"].includes(role)) {
      return json(403, { ok: false, error: "Requires admin, finance or operations role" });
    }
    if (triggeredBy === "cron") triggeredBy = "manual";
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  const startedAt = new Date().toISOString();

  const finish = async (ok: boolean, fields: Record<string, unknown>, httpStatus = 200) => {
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

  if (!HEYREACH_API_KEY) {
    console.warn("[heyreach-sync] HEYREACH_API_KEY not set — skipping");
    return finish(false, { error: "HEYREACH_API_KEY not configured" });
  }

  try {
    // ── 1. Validate the API key. On failure, touch NO data. ──────────────────
    const check = await fetchWithRetry(`${HEYREACH_API_BASE}/auth/CheckApiKey`, {
      method: "GET",
      headers: hrHeaders,
    });
    if (!check.ok) {
      return finish(false, {
        error: `HeyReach CheckApiKey failed (HTTP ${check.status}) — sync skipped, no data changed`,
      });
    }

    // ── 2. Discover the working accounts-list endpoint. ──────────────────────
    const discovered = await discoverEndpoint();
    if ("error" in discovered) {
      return finish(false, { error: discovered.error });
    }
    const { method, path } = discovered;
    console.log(`[heyreach-sync] using accounts endpoint: ${method} ${path}`);

    // ── 3. Fetch all HeyReach sender accounts (paginated). ───────────────────
    const accounts: HeyReachAccount[] = [];
    const pageSize = 100;
    let offset = 0;
    let total = Infinity;
    let guard = 0;
    while (offset < total && guard < 200) {
      guard++;
      const res = await fetchWithRetry(
        buildUrl(path, method, offset, pageSize),
        method === "GET"
          ? { method: "GET", headers: hrHeaders }
          : { method: "POST", headers: hrHeaders, body: JSON.stringify({ offset, limit: pageSize }) },
      );
      if (!res.ok) {
        return finish(false, {
          accounts_fetched: accounts.length,
          error: `HeyReach ${method} ${path} failed (HTTP ${res.status}) at offset ${offset} — sync aborted, no data changed`,
        });
      }
      const page = await res.json().catch(() => null);
      const items: HeyReachAccount[] = Array.isArray(page) ? page : page?.items;
      if (!Array.isArray(items)) {
        return finish(false, {
          accounts_fetched: accounts.length,
          error: "HeyReach accounts response had unexpected shape — sync aborted, no data changed",
        });
      }
      total = Array.isArray(page) ? items.length : Number(page.totalCount ?? items.length);
      accounts.push(...items);
      if (items.length < pageSize) break;
      offset += pageSize;
    }

    // index by lowercased email and by normalised profile URL
    const byEmail = new Map<string, HeyReachAccount>();
    const byUrl = new Map<string, HeyReachAccount>();
    for (const a of accounts) {
      if (a.emailAddress) byEmail.set(a.emailAddress.trim().toLowerCase(), a);
      const nu = normalizeProfileUrl(a.profileUrl);
      if (nu) byUrl.set(nu, a);
    }

    // ── 4. Load contractors that carry an email OR a LinkedIn URL. ───────────
    const { data: contractors, error: cErr } = await supabase
      .from("contractors")
      .select("id, full_name, heyreach_email, linkedin_url, heyreach_status")
      .neq("status", "deleted")
      .neq("is_anonymised", true)
      .or("heyreach_email.not.is.null,linkedin_url.not.is.null");
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
      const url = normalizeProfileUrl((c as any).linkedin_url);
      const acct = (email && byEmail.get(email)) || (url && byUrl.get(url)) || undefined;

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
        if (uErr) console.warn(`[heyreach-sync] update failed for ${(c as any).id}: ${uErr.message}`);
        else updatedCount++;
      } else {
        unchangedIds.push((c as any).id);
      }
    }

    if (unchangedIds.length) {
      await supabase.from("contractors").update({ heyreach_synced_at: nowIso }).in("id", unchangedIds);
    }

    console.log(`[heyreach-sync] endpoint=${method} ${path} accounts=${accounts.length} matched=${matched} unmatched=${unmatched} changed=${changes.length}`);

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
