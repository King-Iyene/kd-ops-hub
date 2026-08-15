// supabase/functions/flutterwave-transfer/index.ts
//
// Edge Function that handles ALL Flutterwave v3 server-to-server API calls.
// Mirrors paystack-transfer/index.ts's shape and safety guarantees exactly:
//   - JWT + role gate on money-moving actions
//   - Cap enforcement (check_transfer_caps) with p_intent=true reservation
//   - Deterministic reference (kdopsfw_<itemId>) for idempotency
//   - Pre-flight de-dup: if we already dispatched this ref, return the existing
//     transfer + live status instead of firing a duplicate
//   - Self-heal on Flutterwave "duplicate reference" errors by verifying
//   - 429 retry with jitter; NO retry on 5xx (may have processed)
//   - Full transfer_audit logging with actor_ip_hash / actor_user_agent
//
// Deploy: supabase functions deploy flutterwave-transfer --no-verify-jwt
// Secrets required (any TEST or LIVE set — mode picks which):
//   FLUTTERWAVE_SECRET_KEY_TEST / _LIVE
//   FLUTTERWAVE_PUBLIC_KEY_TEST / _LIVE  (optional — not used here)
//
// Auth model:
//   resolve_account   — open (unauthenticated OK — mirrors Paystack)
//   list_banks        — open (unauthenticated OK)
//   All others        — require JWT + role in (super_admin, admin, finance)
//
// Supported actions:
//   list_banks         — full Nigerian bank list
//   resolve_account    — verify a bank account number
//   initiate_transfer  — single transfer (used for retries)
//   bulk_transfer      — up to 1000 transfers in one call (v3 supports it)
//   verify_transfer    — check transfer status by our reference
//   get_balance        — current NGN wallet balance
//
// Mode selection:
//   Reads company_settings.flutterwave_mode via service_role and picks the
//   matching secret set (FLUTTERWAVE_SECRET_KEY_{TEST,LIVE}). Cached per
//   invocation so we don't hit the DB more than once per request.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const FLUTTERWAVE_BASE = "https://api.flutterwave.com/v3";

const ALLOWED_ORIGINS = [
  "https://ops.kdsquares.com",
  "http://localhost:5173",
  "http://localhost:8080",
  "http://localhost:3000",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin)
      ? origin
      : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };
}

const PRIVILEGED_ACTIONS = new Set([
  "initiate_transfer",
  "bulk_transfer",
  "verify_transfer",
  "get_balance",
]);

const PRIVILEGED_ROLES = new Set(["super_admin", "admin", "finance"]);

// Actions whose NGN amount counts against the actor's single/daily/monthly cap.
// Same set as Paystack — the cap check is per-actor, not per-provider.
const CAP_ENFORCED_ACTIONS = new Set(["initiate_transfer", "bulk_transfer"]);

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip")
       ?? req.headers.get("x-real-ip")
       ?? "unknown";
}

interface AuditRow {
  actor_id?: string | null;
  actor_role?: string | null;
  action: string;
  outcome?: "ok" | "denied" | "error";
  amount_ngn?: number | null;
  recipient_code?: string | null;
  reference?: string | null;
  ip_hash?: string | null;
  user_agent?: string | null;
  metadata?: Record<string, unknown>;
  reason?: string | null;
  provider?: string;
}

async function writeTransferAudit(serviceClient: any, row: AuditRow) {
  try {
    await serviceClient.from("transfer_audit").insert({
      actor_id: row.actor_id ?? null,
      actor_role: row.actor_role ?? null,
      action: row.action,
      outcome: row.outcome ?? "ok",
      amount_ngn: row.amount_ngn ?? null,
      recipient_code: row.recipient_code ?? null,
      reference: row.reference ?? null,
      ip_hash: row.ip_hash ?? null,
      user_agent: row.user_agent ?? null,
      metadata: row.metadata ?? {},
      reason: row.reason ?? null,
      provider: row.provider ?? "flutterwave",
    });
  } catch (e) {
    // Never let audit failure block a transfer — log + continue.
    console.error("[transfer_audit] insert failed:", String(e));
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Mode-aware secret lookup.
//   Reads company_settings.flutterwave_mode (default 'test') and picks the
//   matching Supabase secret. Cached per-invocation to avoid a second DB hit.
// ─────────────────────────────────────────────────────────────────────────
let _cachedSecret: string | null = null;
let _cachedMode: "test" | "live" | null = null;

async function getFlutterwaveSecret(serviceClient: any): Promise<string> {
  if (_cachedSecret) return _cachedSecret;

  const { data } = await serviceClient
    .from("company_settings")
    .select("flutterwave_mode")
    .eq("id", "00000000-0000-0000-0000-000000000001")
    .maybeSingle();
  const mode = ((data as any)?.flutterwave_mode || "test") as "test" | "live";
  _cachedMode = mode;

  const envName = mode === "live"
    ? "FLUTTERWAVE_SECRET_KEY_LIVE"
    : "FLUTTERWAVE_SECRET_KEY_TEST";
  const secret = Deno.env.get(envName);
  if (!secret) {
    throw new Error(
      `${envName} secret not set in Supabase. Add it via 'supabase secrets set ${envName}=FLWSECK...' and redeploy.`,
    );
  }
  // Sanity: test-mode key must start with FLWSECK_TEST-; live must start with
  // FLWSECK- (and NOT FLWSECK_TEST-). Guards against a paste error where a
  // live key lands under the _TEST env var and vice versa.
  const looksTest = secret.startsWith("FLWSECK_TEST-");
  const looksLive = secret.startsWith("FLWSECK-") && !looksTest;
  if (mode === "test" && !looksTest) {
    throw new Error(
      `Mode is TEST but ${envName} does not start with FLWSECK_TEST-. Refusing to make an accidental live call.`,
    );
  }
  if (mode === "live" && !looksLive) {
    throw new Error(
      `Mode is LIVE but ${envName} does not look like a live key (should start with FLWSECK- but not FLWSECK_TEST-). Refusing to fire.`,
    );
  }

  _cachedSecret = secret;
  return secret;
}

// ─────────────────────────────────────────────────────────────────────────
// Rate-limit handling.
//   Flutterwave rate-limits with HTTP 429. Same rules as Paystack:
//   429 = REJECTED, safe to retry. 5xx / timeout = may have processed,
//   NEVER retry. Honour Retry-After when present.
// ─────────────────────────────────────────────────────────────────────────
const FW_MAX_RETRIES = 3;
const FW_MAX_BACKOFF_MS = 15_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function retryDelayMs(res: Response, attempt: number): number {
  const ra = res.headers.get("retry-after");
  if (ra) {
    const secs = Number(ra);
    if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, FW_MAX_BACKOFF_MS);
    const when = Date.parse(ra);
    if (!Number.isNaN(when)) return Math.max(0, Math.min(when - Date.now(), FW_MAX_BACKOFF_MS));
  }
  const base = Math.min(500 * 2 ** attempt, FW_MAX_BACKOFF_MS);
  return base + Math.floor(Math.random() * 250);
}

async function flutterwaveFetch(
  serviceClient: any,
  path: string,
  init: RequestInit = {},
): Promise<any> {
  const secret = await getFlutterwaveSecret(serviceClient);

  for (let attempt = 0; attempt <= FW_MAX_RETRIES; attempt++) {
    const res = await fetch(`${FLUTTERWAVE_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });

    if (res.status === 429 && attempt < FW_MAX_RETRIES) {
      const waitMs = retryDelayMs(res, attempt);
      console.warn(`[flutterwave] 429 on ${path}; retry ${attempt + 1}/${FW_MAX_RETRIES} in ${waitMs}ms`);
      try { await res.text(); } catch { /* ignore */ }
      await sleep(waitMs);
      continue;
    }

    const body = await res.json();
    // Flutterwave v3 response shape: { status: "success" | "error", message, data }
    // Both HTTP non-2xx and status=error mean the call failed.
    if (!res.ok || body?.status === "error") {
      console.error("[flutterwave] API error:", res.status, JSON.stringify(body));
      const err: any = new Error(body?.message || `Flutterwave error (HTTP ${res.status})`);
      err.isFlutterwaveRejection = true;
      err.flutterwaveStatus = res.status;
      err.flutterwaveBody = body;
      throw err;
    }
    return body;
  }

  const err: any = new Error("Flutterwave is rate-limiting requests (HTTP 429). Please retry in a moment.");
  err.isFlutterwaveRejection = true;
  err.flutterwaveStatus = 429;
  throw err;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Declared here so both success and error paths can reference them.
  let intentAuditId: string | null = null;
  let serviceClientRef: any = null;

  try {
    const { action, ...params } = await req.json();
    console.log("[flutterwave-transfer] action:", action);

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    serviceClientRef = serviceClient;

    // ────────────────────────────────────────────────────────────────
    // list_banks: open to unauthenticated callers.
    // ────────────────────────────────────────────────────────────────
    if (action === "list_banks") {
      const body = await flutterwaveFetch(serviceClient, "/banks/NG");
      return new Response(
        JSON.stringify({
          ok: true,
          data: (body.data || []).map((b: any) => ({
            code: String(b.code),
            name: String(b.name),
          })),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ────────────────────────────────────────────────────────────────
    // resolve_account: open to unauthenticated callers (public /join form).
    // ────────────────────────────────────────────────────────────────
    if (action === "resolve_account") {
      const body = await flutterwaveFetch(serviceClient, "/accounts/resolve", {
        method: "POST",
        body: JSON.stringify({
          account_number: String(params.account_number || "").replace(/\D/g, ""),
          account_bank: String(params.bank_code || ""),
        }),
      });
      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            account_name: body.data?.account_name,
            account_number: body.data?.account_number,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ────────────────────────────────────────────────────────────────
    // get_transfer_fee: open — no money moves, no sensitive data. Queries
    // Flutterwave's OWN fee-quote endpoint so the pre-dispatch estimate the
    // operator sees is Flutterwave's real fee for this exact amount, not a
    // guess reusing Paystack's fee tiers (₦10/₦25/₦50 — Flutterwave's own
    // tiers are NOT identical; conflating them showed an inaccurate number
    // on every Flutterwave payment's confirmation screen).
    // ────────────────────────────────────────────────────────────────
    if (action === "get_transfer_fee") {
      const amount = Number(params.amount_ngn ?? 0);
      if (!(amount > 0)) {
        return new Response(
          JSON.stringify({ ok: false, error: "amount_ngn must be > 0" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const qs = new URLSearchParams({ amount: String(amount), currency: "NGN" });
      const body = await flutterwaveFetch(serviceClient, `/transfers/fee?${qs}`);
      const row = Array.isArray(body.data) ? body.data[0] : body.data;
      return new Response(
        JSON.stringify({
          ok: true,
          data: { fee_ngn: Number(row?.fee ?? 0) || 0 },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ────────────────────────────────────────────────────────────────
    // All other actions require a logged-in user + admin/finance role.
    // ────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: authError?.message || "Not authenticated" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let actorRole: string | null = null;
    const ipHash = await sha256Hex(getClientIp(req));
    const userAgent = req.headers.get("user-agent") ?? null;

    if (PRIVILEGED_ACTIONS.has(action)) {
      const { data: profile } = await serviceClient
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      actorRole = profile?.role ?? null;

      if (!actorRole || !PRIVILEGED_ROLES.has(actorRole)) {
        await writeTransferAudit(serviceClient, {
          actor_id: user.id,
          actor_role: actorRole,
          action,
          outcome: "denied",
          ip_hash: ipHash,
          user_agent: userAgent,
          reason: "Insufficient permissions",
          metadata: { params },
        });
        return new Response(
          JSON.stringify({ error: "Insufficient permissions" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // ────────────────────────────────────────────────────────────────
    // Cap enforcement — same RPC as Paystack, provider-agnostic.
    // ────────────────────────────────────────────────────────────────
    if (CAP_ENFORCED_ACTIONS.has(action)) {
      let amountNgn = 0;
      if (action === "initiate_transfer") {
        amountNgn = Number(params.amount_ngn ?? 0);
      } else if (action === "bulk_transfer") {
        const transfers = Array.isArray(params.transfers) ? params.transfers : [];
        // Bulk transfers here are in NGN (Flutterwave uses whole naira for
        // /transfers, not kobo like Paystack).
        amountNgn = transfers.reduce(
          (sum: number, t: any) => sum + Number(t.amount ?? 0),
          0,
        );
      }

      if (amountNgn > 0) {
        const { data: capRows, error: capErr } = await serviceClient.rpc(
          "check_transfer_caps",
          {
            p_user_id: user.id,
            p_amount_ngn: amountNgn,
            p_intent: true,
            p_action: action,
            p_check_batch_cap: action === "bulk_transfer",
            p_ip_hash: ipHash,
            p_user_agent: userAgent,
          },
        );
        const cap = Array.isArray(capRows) ? capRows[0] : capRows;
        if (capErr) {
          console.error("[caps] check_transfer_caps failed:", capErr);
          await writeTransferAudit(serviceClient, {
            actor_id: user.id,
            actor_role: actorRole,
            action,
            outcome: "error",
            amount_ngn: amountNgn,
            ip_hash: ipHash,
            user_agent: userAgent,
            reason: `Cap check failed: ${capErr.message}`,
          });
          return new Response(
            JSON.stringify({ ok: false, error: "Could not verify transfer limits — try again." }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        if (cap && cap.allowed === false) {
          await writeTransferAudit(serviceClient, {
            actor_id: user.id,
            actor_role: actorRole,
            action: "cap_blocked",
            outcome: "denied",
            amount_ngn: amountNgn,
            ip_hash: ipHash,
            user_agent: userAgent,
            reason: cap.reason,
            metadata: {
              attempted_action: action,
              applied_limit_kind: cap.applied_limit_kind,
              applied_limit_ngn: cap.applied_limit_ngn,
              used_today_ngn: cap.used_today_ngn,
              used_month_ngn: cap.used_month_ngn,
            },
          });
          return new Response(
            JSON.stringify({ ok: false, error: cap.reason, cap_blocked: true }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        intentAuditId = cap?.intent_audit_id ?? null;
      }
    }

    // ────────────────────────────────────────────────────────────────
    // Dispatch remaining actions.
    // ────────────────────────────────────────────────────────────────
    let result: unknown;

    switch (action) {
      case "initiate_transfer": {
        if (!params.reference) {
          return new Response(
            JSON.stringify({ error: "reference is required for transfer idempotency" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        // ── Payment integrity: resolve authoritative amount, account, and
        // bank from the DB. Flutterwave transfers are always batch_items
        // (personal transfers go through Paystack).
        const { data: fwRow, error: fwRowErr } = await serviceClient
          .from("batch_items")
          .select("id, amount_ngn, account_number, bank_code, flutterwave_transfer_id, flutterwave_reference, status")
          .eq("flutterwave_reference", params.reference)
          .maybeSingle();
        if (fwRowErr || !fwRow) {
          return new Response(
            JSON.stringify({ error: "No approved batch_items record for this Flutterwave reference" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        // De-dup: if already dispatched, return existing + live status.
        if ((fwRow as any).flutterwave_transfer_id) {
          let liveStatus = (fwRow as any).status;
          try {
            const verifyBody = await flutterwaveFetch(
              serviceClient,
              `/transfers?reference=${encodeURIComponent(params.reference)}`,
            );
            const t = Array.isArray(verifyBody.data) ? verifyBody.data[0] : verifyBody.data;
            liveStatus = mapFlutterwaveStatus(t?.status) || liveStatus;
          } catch (verifyErr) {
            console.warn("[transfer] verify of existing ref failed:", String(verifyErr));
          }
          result = {
            transfer_id: (fwRow as any).flutterwave_transfer_id,
            reference: params.reference,
            status: liveStatus,
            recovered: true,
            verified_status: liveStatus,
          };
          break;
        }

        const fwDbAmount = Number((fwRow as any).amount_ngn);
        const fwDbAccount = String((fwRow as any).account_number || "").replace(/\D/g, "");
        const fwDbBankCode = String((fwRow as any).bank_code || "");

        // Log if client-supplied values differ from DB (possible tampering).
        const fwClientAmount = Number(params.amount_ngn ?? 0);
        const fwClientAccount = String(params.account_number || "").replace(/\D/g, "");
        if (fwClientAmount !== fwDbAmount || fwClientAccount !== fwDbAccount || params.bank_code !== fwDbBankCode) {
          console.warn("[INTEGRITY] FW Client/DB mismatch:", {
            ref: params.reference,
            clientAmount: fwClientAmount, dbAmount: fwDbAmount,
            clientAccount: fwClientAccount, dbAccount: fwDbAccount,
            clientBank: params.bank_code, dbBank: fwDbBankCode,
          });
          await writeTransferAudit(serviceClient, {
            actor_id: user.id,
            actor_role: actorRole,
            action: "integrity_mismatch",
            outcome: "denied",
            amount_ngn: fwClientAmount,
            reference: params.reference,
            ip_hash: ipHash,
            user_agent: userAgent,
            reason: `FW mismatch: client amount=${fwClientAmount}/acct=${fwClientAccount} vs DB amount=${fwDbAmount}/acct=${fwDbAccount}`,
            provider: "flutterwave",
          });
        }

        // Initiate at Flutterwave using DB-authoritative values.
        try {
          const body = await flutterwaveFetch(serviceClient, "/transfers", {
            method: "POST",
            body: JSON.stringify({
              account_bank: fwDbBankCode,
              account_number: fwDbAccount,
              amount: fwDbAmount,
              narration: (params.reason || "KDOps disbursement").slice(0, 100),
              currency: "NGN",
              reference: params.reference,
              debit_currency: "NGN",
            }),
          });
          result = {
            transfer_id: String(body.data?.id ?? ""),
            reference: params.reference,
            status: mapFlutterwaveStatus(body.data?.status) || "pending",
            fee_ngn: Number(body.data?.fee ?? 0) || 0,
            raw: body.data,
          };
        } catch (initErr) {
          try {
            const verifyBody = await flutterwaveFetch(
              serviceClient,
              `/transfers?reference=${encodeURIComponent(params.reference)}`,
            );
            const t = Array.isArray(verifyBody.data) ? verifyBody.data[0] : verifyBody.data;
            if (!t) throw initErr;
            result = {
              transfer_id: String(t?.id ?? ""),
              reference: params.reference,
              status: mapFlutterwaveStatus(t?.status) || "pending",
              fee_ngn: Number(t?.fee ?? 0) || 0,
              recovered: true,
              verified_status: mapFlutterwaveStatus(t?.status),
              raw: t,
            };
          } catch (verifyErr) {
            throw initErr;
          }
        }
        break;
      }

      case "bulk_transfer": {
        const transfers = Array.isArray(params.transfers) ? params.transfers : [];
        if (transfers.length === 0) {
          return new Response(
            JSON.stringify({ error: "transfers array is required and non-empty" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        if (transfers.length > 1000) {
          return new Response(
            JSON.stringify({ error: "Flutterwave bulk-transfers cap is 1000 items per call; chunk further" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        for (const t of transfers) {
          if (!t.reference || !t.bank_code || !t.account_number || t.amount == null) {
            return new Response(
              JSON.stringify({ error: "each transfer requires reference, bank_code, account_number, amount (NGN)" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
        }

        // ── Payment integrity: re-validate every item against the DB.
        const fwBulkRefs = transfers.map((t: any) => String(t.reference));
        const { data: fwDbItems, error: fwDbBulkErr } = await serviceClient
          .from("batch_items")
          .select("flutterwave_reference, amount_ngn, account_number, bank_code")
          .in("flutterwave_reference", fwBulkRefs);
        if (fwDbBulkErr) {
          console.error("[INTEGRITY] FW bulk DB lookup failed:", fwDbBulkErr);
          return new Response(
            JSON.stringify({ error: "Could not verify transfer records against DB" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        const fwDbMap = new Map(
          ((fwDbItems || []) as any[]).map((r: any) => [r.flutterwave_reference, r]),
        );

        const title = String(params.title || "KDOps bulk").slice(0, 100);
        const bulk_data = transfers.map((t: any) => {
          const dbRow = fwDbMap.get(t.reference);
          const amount = dbRow ? Number(dbRow.amount_ngn) : Number(t.amount);
          const account = dbRow ? String(dbRow.account_number || "").replace(/\D/g, "") : String(t.account_number || "").replace(/\D/g, "");
          const bank = dbRow ? String(dbRow.bank_code || "") : t.bank_code;
          if (dbRow && (Number(t.amount) !== amount || String(t.account_number || "").replace(/\D/g, "") !== account)) {
            console.warn("[INTEGRITY] FW bulk mismatch:", { ref: t.reference, clientAmount: t.amount, dbAmount: amount });
          }
          return {
            bank_code: bank,
            account_number: account,
            amount,
            currency: "NGN",
            narration: String(t.narration || title).slice(0, 100),
            reference: t.reference,
          };
        });
        const body = await flutterwaveFetch(serviceClient, "/bulk-transfers", {
          method: "POST",
          body: JSON.stringify({ title, bulk_data }),
        });
        result = {
          batch_id: String(body.data?.id ?? ""),
          approver: body.data?.approver ?? null,
          created_at: body.data?.created_at ?? null,
          raw: body.data,
        };
        break;
      }

      case "verify_transfer": {
        // Verify by reference (safer than by id — the caller always has the ref).
        const qs = new URLSearchParams({ reference: params.reference });
        const body = await flutterwaveFetch(serviceClient, `/transfers?${qs}`);
        const t = Array.isArray(body.data) ? body.data[0] : body.data;
        const feeNgn = Number(t?.fee ?? 0) || 0;
        result = {
          status: mapFlutterwaveStatus(t?.status),
          raw_status: t?.status ?? null,
          transfer_id: String(t?.id ?? ""),
          reason: t?.complete_message || t?.reason || null,
          fee_ngn: feeNgn > 0 ? feeNgn : null,
          raw: t,
        };
        break;
      }

      case "get_balance": {
        const body = await flutterwaveFetch(serviceClient, "/balances/NGN");
        // Flutterwave returns { data: { currency, available_balance, ledger_balance } }
        result = {
          available: Number(body.data?.available_balance ?? 0),
          ledger: Number(body.data?.ledger_balance ?? 0),
          currency: "NGN",
        };
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }

    // ────────────────────────────────────────────────────────────────
    // Flip the intent audit row to 'ok' with final metadata.
    // ────────────────────────────────────────────────────────────────
    if (CAP_ENFORCED_ACTIONS.has(action) && intentAuditId) {
      const recipientCount = Array.isArray(params.transfers) ? params.transfers.length : 1;
      try {
        await serviceClient.from("transfer_audit").update({
          outcome: "ok",
          reference: action === "initiate_transfer" ? params.reference ?? null : null,
          metadata: {
            recipient_count: recipientCount,
            recovered: (result as any)?.recovered ?? false,
            flutterwave_status: (result as any)?.status ?? null,
          },
        }).eq("id", intentAuditId);
      } catch (auditErr) {
        console.error("[transfer_audit] intent update failed:", String(auditErr));
      }
    } else if (CAP_ENFORCED_ACTIONS.has(action) && !intentAuditId) {
      const amountNgn = action === "initiate_transfer"
        ? Number(params.amount_ngn ?? 0)
        : (Array.isArray(params.transfers) ? params.transfers : []).reduce(
            (s: number, t: any) => s + Number(t.amount ?? 0), 0,
          );
      await writeTransferAudit(serviceClient, {
        actor_id: user.id,
        actor_role: actorRole,
        action,
        outcome: "ok",
        amount_ngn: amountNgn,
        reference: action === "initiate_transfer" ? params.reference ?? null : null,
        ip_hash: ipHash,
        user_agent: userAgent,
        metadata: {
          recipient_count: Array.isArray(params.transfers) ? params.transfers.length : 1,
          recovered: (result as any)?.recovered ?? false,
          flutterwave_status: (result as any)?.status ?? null,
        },
      });
    }

    return new Response(JSON.stringify({ ok: true, data: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFlutterwaveRejection = (err as any)?.isFlutterwaveRejection === true;
    try {
      const errClient = serviceClientRef ?? createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      if (intentAuditId) {
        await errClient.from("transfer_audit").update({
          outcome: "error",
          reason: message.slice(0, 500),
        }).eq("id", intentAuditId);
      } else {
        await errClient.from("transfer_audit").insert({
          action: isFlutterwaveRejection ? "flutterwave_rejected" : "edge_error",
          outcome: "error",
          reason: message.slice(0, 500),
          metadata: {},
          provider: "flutterwave",
        });
      }
    } catch { /* swallow */ }
    return new Response(
      JSON.stringify({ ok: false, error: message, flutterwave_rejection: isFlutterwaveRejection }),
      {
        status: isFlutterwaveRejection ? 422 : 500,
        headers: { ...(getCorsHeaders(req)), "Content-Type": "application/json" },
      },
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Map Flutterwave's raw status enum to our internal batch_items.status.
//   Flutterwave uses: NEW, PROCESSING, SUCCESSFUL, FAILED, REVERSED (and
//   sometimes lowercase versions). We normalise to our four canonical values:
//   'pending' | 'succeeded' | 'failed' | 'reversed'.
// ─────────────────────────────────────────────────────────────────────────
function mapFlutterwaveStatus(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = String(raw).toLowerCase();
  if (v === "successful" || v === "success") return "succeeded";
  if (v === "failed") return "failed";
  if (v === "reversed") return "reversed";
  if (v === "new" || v === "processing" || v === "pending" || v === "queued") return "pending";
  return null;
}
