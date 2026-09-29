/**
 * Proxy-aware fetch for Paystack API calls.
 *
 * Routes all Paystack requests through the Fly.io static-IP proxy when
 * PAYSTACK_PROXY_URL and PAYSTACK_PROXY_KEY are set as Supabase Edge
 * Function secrets. This is REQUIRED in production — Paystack's IP whitelist
 * blocks direct calls from Supabase Edge Functions (Deno Deploy has no
 * static egress IP). The direct-fetch fallback exists only as a rollout
 * safety net for local development; in production it will fail with
 * "Your IP address is not allowed to make this call".
 *
 * See docs/paystack-proxy-setup.md for full setup and troubleshooting.
 */

const PAYSTACK_BASE = "https://api.paystack.co";

export function getPaystackProxyConfig(): { proxyUrl: string; proxyKey: string } | null {
  const proxyUrl = Deno.env.get("PAYSTACK_PROXY_URL");
  const proxyKey = Deno.env.get("PAYSTACK_PROXY_KEY");
  console.log(`[paystack-proxy] env check: PAYSTACK_PROXY_URL=${proxyUrl ? proxyUrl.substring(0, 20) + "..." : "MISSING"}, PAYSTACK_PROXY_KEY=${proxyKey ? proxyKey.substring(0, 6) + "..." : "MISSING"}`);
  if (proxyUrl && proxyKey) return { proxyUrl: proxyUrl.replace(/\/$/, ""), proxyKey };
  return null;
}

/**
 * Drop-in replacement for fetch() that routes through the proxy when configured.
 * Accepts the same arguments as a normal Paystack fetch — full URL or path.
 */
export function paystackProxyFetch(
  urlOrPath: string,
  init: RequestInit = {},
): Promise<Response> {
  const proxy = getPaystackProxyConfig();
  console.log(`[paystack-proxy] v2 config=${proxy ? "ACTIVE → " + proxy.proxyUrl : "NOT SET — direct fetch"}`);

  if (!proxy) {
    // No proxy configured — direct call (will fail if IP-whitelisted)
    const url = urlOrPath.startsWith("http") ? urlOrPath : `${PAYSTACK_BASE}${urlOrPath}`;
    return fetch(url, init);
  }

  // Route through the proxy: rewrite the URL to point at the proxy,
  // keeping the Paystack path intact.
  let paystackPath: string;
  if (urlOrPath.startsWith("http")) {
    // Full URL like "https://api.paystack.co/balance" → "/balance"
    const parsed = new URL(urlOrPath);
    paystackPath = parsed.pathname + parsed.search;
  } else {
    paystackPath = urlOrPath;
  }

  const proxyTarget = `${proxy.proxyUrl}/paystack${paystackPath}`;

  const headers = new Headers(init.headers);
  headers.set("X-Proxy-Key", proxy.proxyKey);

  return fetch(proxyTarget, { ...init, headers });
}
