// v2
// supabase/functions/paystack-transfer/index.ts
//
// Edge Function that handles ALL Paystack server-to-server API calls.
// The browser NEVER sees the Paystack secret key.
//
// Deploy: supabase functions deploy paystack-transfer --no-verify-jwt
// Set secret: supabase secrets set PAYSTACK_SECRET_KEY=sk_live_...
//
// Auth:
//   resolve_account is open to unauthenticated callers (used by the public
//   /join form for bank account verification — account name lookup is not
//   sensitive; the secret key never leaves this function).
//   All other actions require a valid Supabase JWT.
//   Dangerous actions (create_recipient, initiate_transfer, verify_transfer)
//   also require an admin/finance role from the profiles table.
//
// Supported actions (passed via JSON body { action, ... }):
//   resolve_account   — verify a bank account number (unauthenticated OK)
//   create_recipient  — create a transfer recipient (admin/finance only)
//   initiate_transfer — initiate a transfer (admin/finance only)
//   verify_transfer   — check transfer status (admin/finance only)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { getCorsHeaders } from "../_shared/cors.ts";

const PAYSTACK_BASE = "https://api.paystack.co";

const PRIVILEGED_ACTIONS = new Set([
  "create_recipient",
  "initiate_transfer",
  "bulk_transfer",
  "verify_transfer",
  "get_balance",
]);

const PRIVILEGED_ROLES = new Set(["super_admin", "admin", "finance"]);

// Actions whose NGN amount counts against the actor's single/daily/monthly cap.
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
    });
  } catch (e) {
    // Never let audit failure block a transfer — log + continue.
    console.error("[transfer_audit] insert failed:", String(e));
  }
}

// Mode-aware secret lookup — mirrors getFlutterwaveSecret() in
// flutterwave-transfer/index.ts. Reads company_settings.paystack_mode
// ('test' | 'live', default 'live') and picks the matching env var.
// Falls back to the legacy single PAYSTACK_SECRET_KEY for backward compat.
let _cachedPaystackSecret: string | null = null;

async function getPaystackSecret(serviceClient?: any): Promise<string> {
  if (_cachedPaystackSecret) return _cachedPaystackSecret;

  const svc = serviceClient ?? createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data } = await svc
    .from("company_settings")
    .select("paystack_mode, paystack_secret_key_enc")
    .eq("id", "00000000-0000-0000-0000-000000000001")
    .maybeSingle();
  const mode = ((data as any)?.paystack_mode || "live") as "test" | "live";

  // Try mode-specific env vars first (PAYSTACK_SECRET_KEY_TEST / _LIVE).
  const envName = mode === "live"
    ? "PAYSTACK_SECRET_KEY_LIVE"
    : "PAYSTACK_SECRET_KEY_TEST";
  let secret = Deno.env.get(envName);

  // Fallback: legacy single PAYSTACK_SECRET_KEY (backward compatible).
  if (!secret) {
    secret = Deno.env.get("PAYSTACK_SECRET_KEY");
  }

  // Last resort: DB-stored key (deprecated).
  if (!secret) {
    secret = (data as any)?.paystack_secret_key_enc || null;
    if (secret) console.warn("[paystack-transfer] DEPRECATED: reading Paystack secret from company_settings. Set PAYSTACK_SECRET_KEY_LIVE / _TEST env vars instead.");
  }

  if (!secret) {
    throw new Error(
      `No Paystack secret key found. Set ${envName} via 'supabase secrets set ${envName}=sk_...' and redeploy.`,
    );
  }

  // Sanity: test-mode key must start with sk_test_; live must start with
  // sk_live_. Guards against a paste error where a live key lands under the
  // _TEST env var and vice versa.
  const looksTest = secret.startsWith("sk_test_");
  const looksLive = secret.startsWith("sk_live_");
  if (mode === "test" && !looksTest && looksLive) {
    throw new Error(
      `Mode is TEST but the key starts with sk_live_. Refusing to make an accidental live call.`,
    );
  }
  if (mode === "live" && !looksLive && looksTest) {
    throw new Error(
      `Mode is LIVE but the key starts with sk_test_. Refusing to fire with a test key.`,
    );
  }

  _cachedPaystackSecret = secret;
  return secret;
}

// Rate-limit handling --------------------------------------------------------
// Paystack returns HTTP 429 when we exceed its rate limit. A 429 means the
// request was REJECTED, not processed — so retrying is safe even for transfers
// (it cannot double-send). We honour the Retry-After header when present, else
// back off exponentially with jitter. We do NOT retry 5xx/timeouts here, since
// those may have been processed.
const PAYSTACK_MAX_RETRIES = 3;
const PAYSTACK_MAX_BACKOFF_MS = 15_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function retryDelayMs(res: Response, attempt: number): number {
  const ra = res.headers.get("retry-after");
  if (ra) {
    const secs = Number(ra);
    if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, PAYSTACK_MAX_BACKOFF_MS);
    const when = Date.parse(ra);
    if (!Number.isNaN(when)) return Math.max(0, Math.min(when - Date.now(), PAYSTACK_MAX_BACKOFF_MS));
  }
  // 0.5s, 1s, 2s … capped, plus jitter to avoid synchronised retries.
  const base = Math.min(500 * 2 ** attempt, PAYSTACK_MAX_BACKOFF_MS);
  return base + Math.floor(Math.random() * 250);
}

async function paystackFetch(path: string, init: RequestInit = {}) {
  const secret = await getPaystackSecret();

  for (let attempt = 0; attempt <= PAYSTACK_MAX_RETRIES; attempt++) {
    const res = await fetch(`${PAYSTACK_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });

    // Rate-limited: safe to retry (request was not processed). Drain the body
    // to free the connection, wait, and try again — unless we're out of tries.
    if (res.status === 429 && attempt < PAYSTACK_MAX_RETRIES) {
      const waitMs = retryDelayMs(res, attempt);
      console.warn(`[paystack] 429 on ${path}; retry ${attempt + 1}/${PAYSTACK_MAX_RETRIES} in ${waitMs}ms`);
      try { await res.text(); } catch { /* ignore */ }
      await sleep(waitMs);
      continue;
    }

    const body = await res.json();
    if (!res.ok || body?.status === false) {
      console.error("[paystack] API error:", res.status, JSON.stringify(body));
      // PaystackRejection signals that Paystack itself rejected the request
      // (bad account, NUBAN unresolved, etc.) so the outer catch can return
      // HTTP 422 instead of a misleading 500. The browser console stops
      // logging Paystack rejections as red 500 errors, while real internal
      // exceptions still surface as 500.
      const err: any = new Error(body?.message || `Paystack error (HTTP ${res.status})`);
      err.isPaystackRejection = true;
      err.paystackStatus = res.status;
      throw err;
    }
    return body;
  }

  // All retries exhausted on 429.
  const err: any = new Error("Paystack is rate-limiting requests (HTTP 429). Please retry in a moment.");
  err.isPaystackRejection = true;
  err.paystackStatus = 429;
  throw err;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Declared here so both the success and error paths can reference them.
  let intentAuditId: string | null = null;
  let serviceClientRef: any = null;

  try {
    const { action, ...params } = await req.json();

    // ---------------------------------------------------------------
    // list_banks: open to unauthenticated callers.
    // Returns the full Paystack-supported bank list for Nigeria (~300+).
    // The secret key is used only on the server — never reaches the client.
    // ---------------------------------------------------------------
    if (action === "list_banks") {
      const body = await paystackFetch(
        "/bank?currency=NGN&use_cursor=false&perPage=300&country=nigeria",
      );
      return new Response(
        JSON.stringify({
          ok: true,
          data: (body.data || []).map((b: any) => ({ code: b.code, name: b.name })),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---------------------------------------------------------------
    // resolve_account: open to unauthenticated callers (public /join form).
    // Account-name lookup is not sensitive — secret key stays server-side.
    // ---------------------------------------------------------------
    if (action === "resolve_account") {
      const qs = new URLSearchParams({
        account_number: params.account_number,
        bank_code: params.bank_code,
      });
      const body = await paystackFetch(`/bank/resolve?${qs}`);
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

    // ---------------------------------------------------------------
    // All other actions require a logged-in user.
    // ---------------------------------------------------------------
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const jwt = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(jwt);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: authError?.message || "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---------------------------------------------------------------
    // Role gate: privileged actions need admin/finance profile.
    // Uses service-role client to bypass RLS on profiles. Also stash
    // role + service client + request fingerprint for audit logging.
    // ---------------------------------------------------------------
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    serviceClientRef = serviceClient;
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
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    // Cap enforcement for money-moving actions. Fetches the actor's
    // configured single/daily/monthly limits and checks against rolling
    // usage. On denial we audit the attempt and return 403 with the reason.
    if (CAP_ENFORCED_ACTIONS.has(action)) {
      let amountNgn = 0;
      if (action === "initiate_transfer") {
        amountNgn = Number(params.amount_ngn ?? 0);
      } else if (action === "bulk_transfer") {
        const transfers = Array.isArray(params.transfers) ? params.transfers : [];
        // Bulk transfers send Paystack kobo amounts; convert to NGN for cap math.
        amountNgn = transfers.reduce(
          (sum: number, t: any) => sum + (Number(t.amount ?? 0) / 100),
          0,
        );
      }

      if (amountNgn > 0) {
        // B-5: pass p_intent=true so the RPC reserves an 'intent' audit row
        // that counts against rolling caps for any concurrent requests.
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
          // Cap denied: no intent row was inserted (only inserted on allowed=true).
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
        // Store intent row id so we can update it to 'ok' or 'error' after dispatch.
        intentAuditId = cap?.intent_audit_id ?? null;
      }
    }

    // ---------------------------------------------------------------
    // Dispatch remaining actions to Paystack.
    // ---------------------------------------------------------------
    let result: unknown;

    switch (action) {
      case "create_recipient": {
        const body = await paystackFetch("/transferrecipient", {
          method: "POST",
          body: JSON.stringify({
            type: "nuban",
            name: params.name,
            account_number: params.account_number,
            bank_code: params.bank_code,
            currency: "NGN",
          }),
        });
        result = body.data;
        break;
      }

      case "initiate_transfer": {
        if (!params.reference) {
          return new Response(
            JSON.stringify({ error: "reference is required for transfer idempotency" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        // ── Payment integrity: resolve the authoritative amount and
        // recipient from the DB rather than trusting client-supplied values.
        // Reference prefix determines the table:
        //   kdopspt_ → personal_transfers (director's personal money)
        //   kdops_   → batch_items (company disbursements / payroll)
        const isPersonalTransfer = String(params.reference).startsWith("kdopspt_");
        let dbAmountNgn: number;
        let dbRecipientCode: string;
        if (isPersonalTransfer) {
          const { data: ptRow, error: ptErr } = await serviceClient
            .from("personal_transfers")
            .select("id, amount_ngn, paystack_recipient_code, paystack_transfer_code, paystack_reference, status")
            .eq("paystack_reference", params.reference)
            .maybeSingle();
          if (ptErr || !ptRow) {
            return new Response(
              JSON.stringify({ error: "No approved personal_transfers record for this reference" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
          if ((ptRow as any).paystack_transfer_code) {
            let liveStatus = (ptRow as any).status;
            try {
              const verifyBody = await paystackFetch(
                `/transfer/verify/${encodeURIComponent(params.reference)}`,
              );
              liveStatus = verifyBody.data?.status || liveStatus;
            } catch (verifyErr) {
              console.warn("[transfer] verify of existing ref failed:", String(verifyErr));
            }
            result = {
              transfer_code: (ptRow as any).paystack_transfer_code,
              reference: params.reference,
              status: liveStatus,
              recovered: true,
              verified_status: liveStatus,
            };
            break;
          }
          dbAmountNgn = Number((ptRow as any).amount_ngn);
          dbRecipientCode = (ptRow as any).paystack_recipient_code;
        } else {
          const { data: biRow, error: biErr } = await serviceClient
            .from("batch_items")
            .select("id, amount_ngn, paystack_recipient_code, paystack_transfer_code, paystack_reference, status")
            .eq("paystack_reference", params.reference)
            .maybeSingle();
          if (biErr || !biRow) {
            return new Response(
              JSON.stringify({ error: "No approved batch_items record for this reference" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
          if ((biRow as any).paystack_transfer_code) {
            let liveStatus = (biRow as any).status;
            try {
              const verifyBody = await paystackFetch(
                `/transfer/verify/${encodeURIComponent(params.reference)}`,
              );
              liveStatus = verifyBody.data?.status || liveStatus;
            } catch (verifyErr) {
              console.warn("[transfer] verify of existing ref failed:", String(verifyErr));
            }
            result = {
              transfer_code: (biRow as any).paystack_transfer_code,
              reference: params.reference,
              status: liveStatus,
              recovered: true,
              verified_status: liveStatus,
            };
            break;
          }
          dbAmountNgn = Number((biRow as any).amount_ngn);
          dbRecipientCode = (biRow as any).paystack_recipient_code;
        }

        if (!dbRecipientCode) {
          return new Response(
            JSON.stringify({ error: "DB record has no paystack_recipient_code — cannot send" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        // Log if client-supplied values differ from DB (possible tampering).
        const clientAmount = Number(params.amount_ngn ?? 0);
        if (clientAmount !== dbAmountNgn || params.recipient_code !== dbRecipientCode) {
          console.warn(
            "[INTEGRITY] Client/DB mismatch on initiate_transfer:",
            { ref: params.reference, clientAmount, dbAmountNgn, clientRecipient: params.recipient_code, dbRecipient: dbRecipientCode },
          );
          await writeTransferAudit(serviceClient, {
            actor_id: user.id,
            actor_role: actorRole,
            action: "integrity_mismatch",
            outcome: "denied",
            amount_ngn: clientAmount,
            recipient_code: params.recipient_code,
            reference: params.reference,
            ip_hash: ipHash,
            user_agent: userAgent,
            reason: `Client sent amount=${clientAmount}/recipient=${params.recipient_code} but DB has amount=${dbAmountNgn}/recipient=${dbRecipientCode}`,
          });
        }

        // Initiate at Paystack using DB-authoritative values.
        try {
          const body = await paystackFetch("/transfer", {
            method: "POST",
            body: JSON.stringify({
              source: "balance",
              reason: params.reason || "KDOps disbursement",
              amount: Math.round(dbAmountNgn * 100),
              recipient: dbRecipientCode,
              reference: params.reference,
            }),
          });
          result = body.data;
        } catch (initErr) {
          const msg = String((initErr as Error)?.message || "").toLowerCase();
          const isDup =
            msg.includes("reference already exists") ||
            msg.includes("unique reference") ||
            msg.includes("duplicate");
          if (!isDup) throw initErr;
          const verifyBody = await paystackFetch(
            `/transfer/verify/${encodeURIComponent(params.reference)}`,
          );
          result = {
            transfer_code: verifyBody.data?.transfer_code,
            reference: params.reference,
            status: verifyBody.data?.status,
            id: verifyBody.data?.id,
            recovered: true,
            verified_status: verifyBody.data?.status,
          };
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
        if (transfers.length > 100) {
          return new Response(
            JSON.stringify({ error: "Paystack bulk_transfer max is 100 items per call" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        for (const t of transfers) {
          if (!t.reference || !t.recipient || t.amount == null) {
            return new Response(
              JSON.stringify({ error: "each transfer requires reference, recipient, and amount (kobo)" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
        }

        // ── Payment integrity: re-validate every item against the DB.
        // Bulk transfers are always batch_items (never personal_transfers).
        const bulkRefs = transfers.map((t: any) => String(t.reference));
        const { data: dbItems, error: dbBulkErr } = await serviceClient
          .from("batch_items")
          .select("paystack_reference, amount_ngn, paystack_recipient_code")
          .in("paystack_reference", bulkRefs);
        if (dbBulkErr) {
          console.error("[INTEGRITY] bulk DB lookup failed:", dbBulkErr);
          return new Response(
            JSON.stringify({ error: "Could not verify transfer records against DB" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        const dbMap = new Map(
          ((dbItems || []) as any[]).map((r: any) => [r.paystack_reference, r]),
        );
        const verifiedTransfers = transfers.map((t: any) => {
          const dbRow = dbMap.get(t.reference);
          if (!dbRow) {
            console.warn("[INTEGRITY] bulk ref not found in DB:", t.reference);
            return t;
          }
          const dbAmountKobo = Math.round(Number(dbRow.amount_ngn) * 100);
          const dbRecipient = dbRow.paystack_recipient_code;
          if (Number(t.amount) !== dbAmountKobo || t.recipient !== dbRecipient) {
            console.warn("[INTEGRITY] bulk mismatch:", {
              ref: t.reference,
              clientAmount: t.amount,
              dbAmountKobo,
              clientRecipient: t.recipient,
              dbRecipient,
            });
          }
          return {
            ...t,
            amount: dbAmountKobo,
            recipient: dbRecipient || t.recipient,
          };
        });

        const body = await paystackFetch("/transfer/bulk", {
          method: "POST",
          body: JSON.stringify({ source: "balance", transfers: verifiedTransfers }),
        });
        result = body.data;
        break;
      }

      case "verify_transfer": {
        const body = await paystackFetch(
          `/transfer/verify/${encodeURIComponent(params.reference)}`,
        );
        // fee_charged comes back in kobo on the transfer object (not on
        // the inner data wrapper). Older Paystack responses called it
        // `fee` — fall back to either spelling. Convert to NGN for
        // consistency with how every other amount is stored on our
        // side. NULL when Paystack hasn't decided yet (still pending).
        //
        // This is the COMBINED total (transfer fee + government stamp
        // duty), not the pure transfer fee — confirmed against a real
        // Paystack dashboard entry ("Total fees" = "Transfer fees" +
        // "Stamp duty fee"). Every caller of this action (ReceiptModal's
        // fee backfill, Transactions' background reconcile) treats the
        // stored fee_ngn as the fee alone and separately adds stamp duty
        // on top, so returning the raw combined value double-counted the
        // ₦50 duty on every backfilled fee for a transfer ≥ ₦10,000.
        // Subtract it here, mirroring the identical fix in
        // paystack-webhook/index.ts. Keep STAMP_DUTY_* in sync with
        // src/lib/paystack.ts if Paystack's duty rule ever changes.
        const STAMP_DUTY_THRESHOLD_NGN = 10_000;
        const STAMP_DUTY_AMOUNT_NGN = 50;
        const feeKobo =
          body.data?.fee_charged ?? body.data?.fee ?? body.data?.transfer?.fee_charged ?? null;
        let feeNgn = feeKobo == null ? null : Number(feeKobo) / 100;
        if (feeNgn != null) {
          const transferAmountNgn = Number(body.data?.amount || 0) / 100;
          const stampDuty = transferAmountNgn >= STAMP_DUTY_THRESHOLD_NGN ? STAMP_DUTY_AMOUNT_NGN : 0;
          feeNgn = Math.max(0, feeNgn - stampDuty);
        }
        result = {
          status: body.data?.status,
          transfer_code: body.data?.transfer_code,
          reason: body.data?.failures?.[0]?.reason || body.data?.reason,
          fee_ngn: feeNgn,
          raw: body.data,
        };
        break;
      }

      case "get_balance": {
        const body = await paystackFetch('/balance');
        const ngnBalance = Array.isArray(body.data)
          ? body.data.find((b: any) => b.currency === 'NGN')
          : body.data;
        result = {
          available: (ngnBalance?.balance ?? 0) / 100,
          currency: 'NGN',
        };
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
    }

    // B-5: Update the intent audit row to 'ok' with final Paystack metadata.
    // This avoids a duplicate INSERT and keeps cap accounting accurate.
    if (CAP_ENFORCED_ACTIONS.has(action) && intentAuditId) {
      const recipientCount = Array.isArray(params.transfers) ? params.transfers.length : 1;
      try {
        await serviceClient.from("transfer_audit").update({
          outcome: "ok",
          recipient_code: action === "initiate_transfer" ? params.recipient_code ?? null : null,
          reference: action === "initiate_transfer" ? params.reference ?? null : null,
          metadata: {
            recipient_count: recipientCount,
            recovered: (result as any)?.recovered ?? false,
            paystack_status: (result as any)?.status ?? null,
          },
        }).eq("id", intentAuditId);
      } catch (auditErr) {
        console.error("[transfer_audit] intent update failed:", String(auditErr));
      }
    } else if (CAP_ENFORCED_ACTIONS.has(action) && !intentAuditId) {
      // No intent row (amount was 0 or p_intent was not set) — fall back to INSERT.
      const amountNgn = action === "initiate_transfer"
        ? Number(params.amount_ngn ?? 0)
        : (Array.isArray(params.transfers) ? params.transfers : []).reduce(
            (s: number, t: any) => s + (Number(t.amount ?? 0) / 100), 0,
          );
      await writeTransferAudit(serviceClient, {
        actor_id: user.id,
        actor_role: actorRole,
        action,
        outcome: "ok",
        amount_ngn: amountNgn,
        recipient_code: action === "initiate_transfer" ? params.recipient_code ?? null : null,
        reference: action === "initiate_transfer" ? params.reference ?? null : null,
        ip_hash: ipHash,
        user_agent: userAgent,
        metadata: {
          recipient_count: Array.isArray(params.transfers) ? params.transfers.length : 1,
          recovered: (result as any)?.recovered ?? false,
          paystack_status: (result as any)?.status ?? null,
        },
      });
    }

    return new Response(JSON.stringify({ ok: true, data: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isPaystackRejection = (err as any)?.isPaystackRejection === true;
    try {
      const errClient = serviceClientRef ?? createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      if (intentAuditId) {
        // B-5: flip the intent row to 'error' so it stops counting against rolling caps.
        await errClient.from("transfer_audit").update({
          outcome: "error",
          reason: message.slice(0, 500),
        }).eq("id", intentAuditId);
      } else {
        await errClient.from("transfer_audit").insert({
          action: isPaystackRejection ? "paystack_rejected" : "edge_error",
          outcome: "error",
          reason: message.slice(0, 500),
          metadata: {},
        });
      }
    } catch { /* swallow */ }
    // 422 = Paystack rejected (bad account, unresolved NUBAN, etc.) — a
    // business-logic failure, not an infrastructure problem. 500 = our
    // edge function actually crashed. Differentiating these stops the
    // browser from logging legitimate Paystack rejections as red 500s.
    return new Response(
      JSON.stringify({ ok: false, error: message, paystack_rejection: isPaystackRejection }),
      {
        status: isPaystackRejection ? 422 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
