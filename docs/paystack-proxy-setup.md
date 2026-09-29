# Paystack API Proxy — Setup & Operations Guide

## Why this exists

In September 2026, the KD Squares Paystack account was compromised in a security breach. As part of the response, **IP whitelisting** was enabled on Paystack so that only requests from known, trusted IP addresses can reach the Paystack API with our credentials.

Supabase Edge Functions run on Deno Deploy, which does **not** provide a static outbound IP address. Every invocation can exit through a different IP in Deno's global pool. This means edge functions cannot satisfy Paystack's IP whitelist on their own.

The solution is a lightweight **HTTP proxy** running on Fly.io. Fly.io VMs can be assigned a dedicated IPv4 address that remains stable across deploys. All Paystack API traffic from edge functions routes through this proxy, and the proxy's outbound IPv4 is the one whitelisted on Paystack.

```
Edge Function  ──►  Fly.io Proxy  ──►  api.paystack.co
(Deno Deploy,       (dedicated IPv4,    (IP whitelist
 no static IP)       whitelisted)        enforced)
```

> **Do not remove or bypass Paystack's IP whitelist** to work around connectivity issues. It is a required security control following a real incident. If Paystack calls fail, the proxy chain is broken — fix the proxy, don't disable the whitelist.

---

## Architecture

| Component | Location | Purpose |
|---|---|---|
| `paystack-proxy/index.js` | Fly.io app `kdops-paystack-proxy` | Node.js HTTP proxy with static IPv4 egress |
| `supabase/functions/_shared/paystack-fetch.ts` | Supabase Edge Functions | Proxy-aware fetch wrapper used by all Paystack-calling functions |
| `.github/workflows/deploy-paystack-proxy.yml` | GitHub Actions | Deploys the proxy to Fly.io on push |
| `.github/workflows/deploy-edge-functions.yml` | GitHub Actions | Sets proxy secrets + deploys edge functions |

### Edge functions that route through the proxy

All functions that import from `_shared/paystack-fetch.ts`:

- `paystack-transfer` — transfers, balance checks, bank lists, account resolution
- `paystack-reconciliation` — reconciles Paystack transactions
- `paystack-webhook` — processes incoming Paystack webhooks
- `batch-worker` — processes payment batches
- `provider-switch` — payment provider switching logic

### How the proxy-aware fetch works

1. `paystackProxyFetch()` in `_shared/paystack-fetch.ts` checks for `PAYSTACK_PROXY_URL` and `PAYSTACK_PROXY_KEY` env vars.
2. If both are set, it rewrites the Paystack URL to route through the proxy (e.g., `https://api.paystack.co/balance` becomes `https://kdops-paystack-proxy.fly.dev/paystack/balance`) and adds the `X-Proxy-Key` auth header.
3. If the env vars are missing, it falls back to a direct fetch — this exists only for local development. In production, direct calls will fail with "Your IP address is not allowed."

---

## Full setup (from scratch)

Follow these steps if you need to set up the proxy from zero (new Fly.io app, new secrets, etc.). All steps use the browser — no local CLI required.

### 1. Generate a shared proxy key

Go to any password generator and create a random hex string of at least 32 characters (64 recommended). This becomes the `PROXY_KEY` / `PAYSTACK_PROXY_KEY` shared secret. Save it somewhere secure — you'll need it in two places.

### 2. Get a Fly.io deploy token

1. Go to [fly.io/dashboard](https://fly.io/dashboard) and sign in.
2. Navigate to **Tokens** → **Create deploy token**.
3. Copy the token.

### 3. Add GitHub repository secrets

Go to the repo → **Settings** → **Secrets and variables** → **Actions** and add:

| Secret | Value | Used by |
|---|---|---|
| `FLY_API_TOKEN` | Fly.io deploy token from step 2 | `deploy-paystack-proxy.yml` |
| `PROXY_KEY` | The shared secret from step 1 | Both workflows |
| `PAYSTACK_PROXY_URL` | `https://kdops-paystack-proxy.fly.dev` | `deploy-edge-functions.yml` |

The edge function deploy workflow also needs `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` (these should already exist).

### 4. Deploy the proxy

1. Go to **Actions** → **Deploy Paystack Proxy to Fly.io**.
2. Click **Run workflow** → **Run workflow**.
3. Wait for the run to succeed (~1 minute).
4. The "Show static IPs" step prints the Fly.io machine's IP addresses.

### 5. Find the proxy's actual outbound IPv4

**Important**: The IP shown by `flyctl ips list` is the *inbound* dedicated IP. The *outbound* (egress) IP may differ. To find the real outbound IP:

Visit: `https://kdops-paystack-proxy.fly.dev/diag/ip`

This returns the actual IPv4 that Paystack sees, e.g.:
```json
{"outbound_ipv4":"79.127.165.85"}
```

### 6. Whitelist the IP on Paystack

1. Log in to [dashboard.paystack.com](https://dashboard.paystack.com).
2. Go to **Settings** → **API Keys & Webhooks**.
3. In the **IP Whitelist** field, add the outbound IPv4 from step 5.
4. Save.

### 7. Deploy edge functions (sets Supabase secrets automatically)

1. Go to **Actions** → **Deploy Supabase Edge Functions**.
2. Click **Run workflow** → **Run workflow**.
3. The workflow runs `supabase secrets set` before deploying, which injects `PAYSTACK_PROXY_URL` and `PAYSTACK_PROXY_KEY` into the Supabase project.

### 8. Verify

1. Open KDOps → **Payments**. The Paystack Wallet balance should load.
2. Check the Supabase function logs for `[paystack-proxy] v2 config=ACTIVE`.

---

## Troubleshooting

### Symptom: "Your IP address is not allowed to make this call"

This means Paystack is rejecting the request because it came from an IP not on the whitelist. Work through these checks in order:

#### Check 1: Were edge functions redeployed AFTER secrets were set?

Supabase edge functions read secrets at boot time. If you set secrets and then didn't redeploy, the running instances still have the old (or missing) values.

- Go to **GitHub Actions** → **Deploy Supabase Edge Functions** → check that the most recent successful run includes the "Set Paystack proxy secrets" step.
- If not, trigger a manual run via the **Run workflow** button.

#### Check 2: Are the proxy env vars actually reaching the edge function?

Check the Supabase function logs (Dashboard → Edge Functions → paystack-transfer → Logs) for:

```
[PROXY-DIAG] PAYSTACK_PROXY_URL=SET(36 chars) PAYSTACK_PROXY_KEY=SET(128 chars)
```

- If you see `UNDEFINED` for either, the secrets aren't being injected. Re-run the deploy workflow.
- If no `[PROXY-DIAG]` line appears at all, the function code hasn't been updated.

#### Check 3: Is the proxy config ACTIVE or falling back to direct?

Look for this log line:

```
[paystack-proxy] v2 config=ACTIVE → https://kdops-paystack-proxy.fly.dev
```

If you see `NOT SET — direct fetch` instead, the env vars are missing (see Check 2).

#### Check 4: Is the Fly.io proxy actually running?

Visit `https://kdops-paystack-proxy.fly.dev/health` — it should return `{"ok":true}`.

If it's down, go to GitHub Actions and re-run the proxy deploy workflow.

#### Check 5: Does the whitelisted IP match the proxy's real outbound IP?

This was the actual root cause on 2026-09-29. The IP shown by `flyctl ips list` (the dedicated *inbound* IP) was different from the actual *outbound* egress IP.

Visit `https://kdops-paystack-proxy.fly.dev/diag/ip` to get the real outbound IPv4, then compare it against the IP Whitelist on Paystack Dashboard → Settings → API Keys & Webhooks.

If they don't match, add the correct outbound IP to Paystack's whitelist.

#### Check 6: Is the proxy using IPv4 or IPv6?

The proxy's `index.js` sets `family: 4` on all outbound HTTPS requests to force IPv4 DNS resolution. If this option were missing, Node.js might resolve `api.paystack.co` to an IPv6 address, and IPv6 egress uses a shared IP that isn't whitelisted.

Verify the `family: 4` option is present in the `https.request` options in `paystack-proxy/index.js`.

#### Check 7: Are the secret VALUES correct (not just present)?

Secrets can exist in Supabase with incorrect values (wrong key, trailing whitespace, URL with a trailing slash that breaks path joining).

- `PAYSTACK_PROXY_URL` should be exactly `https://kdops-paystack-proxy.fly.dev` (no trailing slash).
- `PAYSTACK_PROXY_KEY` should match the `PROXY_KEY` secret on the Fly.io app exactly.

To verify the key matches, check the SHA256 digest shown in Supabase Dashboard → Edge Functions → Secrets against the value in GitHub Secrets (you can't read GitHub secrets, but you can re-set them to be sure).

### Worked example: the 2026-09-29 incident

**Symptom**: After enabling Paystack IP whitelisting and deploying the Fly.io proxy, the Paystack Wallet balance in KDOps showed "Could not load balance" with error "Your IP address is not allowed to make this call."

**Investigation**:
1. Confirmed proxy was healthy (`/health` returned ok).
2. Confirmed edge function secrets were set (Supabase dashboard showed both with timestamps).
3. Confirmed code was deployed correctly (Supabase Code tab showed proxy-aware fetch).
4. Added diagnostic logging (`[PROXY-DIAG]`) at the top of the request handler — confirmed env vars were `SET` and proxy config was `ACTIVE`.
5. Noticed that `list_banks` (a public reference endpoint) succeeded through the proxy, but `get_balance` (an authenticated endpoint with IP enforcement) still failed.
6. Added a `/diag/ip` endpoint to the proxy that reports the actual outbound IPv4 via api.ipify.org.

**Root cause**: The Fly.io dedicated IPv4 from `flyctl ips list` (66.241.125.134) was the *inbound* IP. The actual *outbound* egress IP was 79.127.165.85 — a completely different address that wasn't on Paystack's whitelist. Additionally, the proxy was missing `family: 4` on its HTTPS requests, risking IPv6 resolution which would use yet another shared IP.

**Fix**: Added `family: 4` to force IPv4 in the proxy, used `/diag/ip` to discover the real outbound IP (79.127.165.85), and whitelisted that IP on Paystack. Balance loaded immediately.
