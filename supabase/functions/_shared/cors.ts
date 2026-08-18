// Shared CORS helper used by every edge function.
//
// Origin allowlist:
//   • Production origin (https://ops.kdsquares.com) — always included.
//   • Localhost origins — always included by default. Set
//     KDOPS_CORS_DENY_LOCALHOST=1 on the Supabase deployment to strip
//     them in production. Kept opt-in so a forgotten env var doesn't
//     break `npm run dev` calling production edge functions.
//
// Allowed headers include x-cron-secret (used by pg_cron ticks),
// x-fw-secret-hash and verif-hash (Flutterwave webhook), and
// x-paystack-signature (Paystack webhook). Widening the header list is
// safe — auth is still enforced per function.

const PROD_ORIGINS = ["https://ops.kdsquares.com"];
const LOCAL_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:8080",
  "http://localhost:3000",
];

function denyLocalhost(): boolean {
  try {
    return Deno.env.get("KDOPS_CORS_DENY_LOCALHOST") === "1";
  } catch {
    return false;
  }
}

export const ALLOWED_ORIGINS = denyLocalhost()
  ? [...PROD_ORIGINS]
  : [...PROD_ORIGINS, ...LOCAL_ORIGINS];

export function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin)
      ? origin
      : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-cron-secret, x-fw-secret-hash, x-paystack-signature, verif-hash",
  };
}
