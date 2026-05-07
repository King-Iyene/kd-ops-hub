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

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const PAYSTACK_BASE = "https://api.paystack.co";

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

async function getPaystackSecret(): Promise<string> {
  const envSecret = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (envSecret) return envSecret;

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data } = await serviceClient
    .from("company_settings")
    .select("paystack_secret_key_enc")
    .eq("id", "00000000-0000-0000-0000-000000000001")
    .maybeSingle();
  const dbSecret = (data as any)?.paystack_secret_key_enc;
  if (dbSecret) return dbSecret;

  throw new Error(
    "PAYSTACK_SECRET_KEY not found. Set it via Supabase secrets or in Settings → Integrations.",
  );
}

async function paystackFetch(path: string, init: RequestInit = {}) {
  const secret = await getPaystackSecret();

  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
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

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Declared here so both the success and error paths can reference them.
  let intentAuditId: string | null = null;
  let serviceClientRef: any = null;

  try {
    const hasEnvSecret = !!Deno.env.get("PAYSTACK_SECRET_KEY");
    const hasAuth = !!req.headers.get("Authorization");
    console.log("[paystack-transfer] env_secret_present:", hasEnvSecret, "| auth_header_present:", hasAuth);

    const { action, ...params } = await req.json();
    console.log("[paystack-transfer] action:", action);

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
        // Pre-flight de-dup: if this reference was already dispatched, return
        // the existing transfer instead of firing a duplicate. Paystack stores
        // refs in `paystack_reference`, not `reference` (that column is the
        // human-facing payment label and may collide).
        const { data: existing } = await serviceClient
          .from("batch_items")
          .select("id, paystack_transfer_code, paystack_reference, status")
          .eq("paystack_reference", params.reference)
          .not("paystack_transfer_code", "is", null)
          .maybeSingle();
        if (existing?.paystack_transfer_code) {
          // We've seen this ref before — verify Paystack so callers receive
          // the live status, not a stale pending. Cheap call, ~250ms.
          let liveStatus = existing.status;
          try {
            const verifyBody = await paystackFetch(
              `/transfer/verify/${encodeURIComponent(params.reference)}`,
            );
            liveStatus = verifyBody.data?.status || existing.status;
          } catch (verifyErr) {
            console.warn("[transfer] verify of existing ref failed:", String(verifyErr));
          }
          result = {
            transfer_code: existing.paystack_transfer_code,
            reference: params.reference,
            status: liveStatus,
            recovered: true,
            verified_status: liveStatus,
          };
          break;
        }
        // Initiate at Paystack. Self-heal if Paystack reports a duplicate ref
        // we don't have on file (covers cases where the DB write failed after
        // a successful Paystack call on a prior attempt).
        try {
          const body = await paystackFetch("/transfer", {
            method: "POST",
            body: JSON.stringify({
              source: "balance",
              reason: params.reason || "KDOps disbursement",
              amount: Math.round((params.amount_ngn ?? 0) * 100),
              recipient: params.recipient_code,
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
          // Recover: query Paystack for the existing transfer state.
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
        // Send up to 100 transfers in a single Paystack API call. Caller is
        // responsible for chunking larger batches and spacing chunks ≥ 5s
        // apart (Paystack rate limit on bulk transfers).
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
        const body = await paystackFetch("/transfer/bulk", {
          method: "POST",
          body: JSON.stringify({ source: "balance", transfers }),
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
        const feeKobo =
          body.data?.fee_charged ?? body.data?.fee ?? body.data?.transfer?.fee_charged ?? null;
        const feeNgn = feeKobo == null ? null : Number(feeKobo) / 100;
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
