import { RefTable, RefSection } from '@/components/guide/shared';
import { CreditCard, RefreshCw, Database, Shield } from 'lucide-react';

export function TechPaymentsSection() {
  return (
    <>
      <h2 className="text-xl font-semibold mb-1">Payments & Paystack</h2>

      <RefSection icon={Shield} title="IP whitelisting & proxy">
        <p className="text-sm text-muted-foreground mb-3">
          Following a security incident in September 2026, Paystack IP whitelisting is enforced on the KD Squares account.
          All Paystack API calls from edge functions route through a dedicated Fly.io proxy that provides a static, whitelisted IPv4 address.
          <strong className="text-foreground"> Do not disable the IP whitelist</strong> — if Paystack calls fail, fix the proxy chain instead.
        </p>
        <RefTable
          cols={['Setting', 'Value']}
          rows={[
            { a: 'Proxy URL',                b: 'https://kdops-paystack-proxy.fly.dev' },
            { a: 'Proxy code',               b: 'paystack-proxy/index.js (deployed to Fly.io via GitHub Actions)' },
            { a: 'Proxy-aware fetch wrapper', b: 'supabase/functions/_shared/paystack-fetch.ts' },
            { a: 'Proxy auth',               b: 'Shared secret in X-Proxy-Key header (PROXY_KEY on Fly.io, PAYSTACK_PROXY_KEY on Supabase)' },
            { a: 'IPv4 enforcement',          b: 'family: 4 in Node.js HTTPS options — prevents IPv6 resolution bypassing the dedicated IP' },
            { a: 'Edge functions using proxy', b: 'paystack-transfer · paystack-reconciliation · paystack-webhook · batch-worker · provider-switch' },
            { a: 'Health check',             b: '/health → {"ok":true}' },
            { a: 'Outbound IP check',        b: '/diag/ip → shows the actual egress IPv4 (compare with Paystack whitelist)' },
            { a: 'Full setup & troubleshooting', b: 'docs/paystack-proxy-setup.md in the repo' },
          ]}
        />
        <h4 className="text-xs font-semibold text-foreground/70 mt-4 mb-2 uppercase tracking-wider">Quick links</h4>
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Paystack Dashboard', href: 'https://dashboard.paystack.com/#/settings/developer' },
            { label: 'Supabase Edge Functions', href: 'https://supabase.com/dashboard/project/mseeurrvdcfxdmvqjjki/functions' },
            { label: 'Supabase Secrets', href: 'https://supabase.com/dashboard/project/mseeurrvdcfxdmvqjjki/settings/vault/secrets' },
            { label: 'Fly.io Dashboard', href: 'https://fly.io/apps/kdops-paystack-proxy' },
            { label: 'Proxy Health', href: 'https://kdops-paystack-proxy.fly.dev/health' },
            { label: 'Proxy Outbound IP', href: 'https://kdops-paystack-proxy.fly.dev/diag/ip' },
            { label: 'Deploy Proxy (Actions)', href: 'https://github.com/King-Iyene/kd-ops-hub/actions/workflows/deploy-paystack-proxy.yml' },
            { label: 'Deploy Edge Functions (Actions)', href: 'https://github.com/King-Iyene/kd-ops-hub/actions/workflows/deploy-edge-functions.yml' },
            { label: 'GitHub Secrets', href: 'https://github.com/King-Iyene/kd-ops-hub/settings/secrets/actions' },
          ].map(({ label, href }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-cyan-400 hover:bg-white/[0.06] hover:text-cyan-300 transition-colors"
            >
              {label}
              <svg className="h-3 w-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
            </a>
          ))}
        </div>
      </RefSection>

      <RefSection icon={CreditCard} title="Paystack integration">
        <RefTable
          cols={['Setting', 'Value']}
          rows={[
            { a: 'Webhook signature verification', b: 'HMAC-SHA512, timing-safe compare. Rejected events return 401' },
            { a: 'Transfer events handled',        b: 'transfer.success · transfer.failed · transfer.reversed' },
            { a: 'Webhook idempotency',            b: '(reference, event_type) UNIQUE — duplicate deliveries silently ignored' },
            { a: 'Fees captured',                  b: 'paystack_fee_ngn per batch_item; shown in the Fees column on the Transactions page' },
            { a: 'CORS allowed origins',           b: 'ops.kdsquares.com · localhost:5173 · localhost:8080 · localhost:3000 (no wildcard *)' },
            { a: 'Funding wallet',                 b: 'Payments page → top-right link, or dashboard.paystack.com/#/balance/' },
          ]}
        />
      </RefSection>

      <RefSection icon={RefreshCw} title="Batch processing & reconciliation">
        <RefTable
          cols={['Setting', 'Value']}
          rows={[
            { a: 'Low balance warning',          b: 'Below ₦50,000 → orange banner on Payments page' },
            { a: 'Batch processing',             b: 'Each transfer is sent via the paystack-transfer edge function, but the batch is currently driven by a browser loop on the Batch page — KEEP THE TAB OPEN AND FOCUSED until the run finishes. A pg_cron watchdog (batch-worker) rescues orphaned items if the tab closes, but slowly (~1/min) — do not rely on it for a large run.' },
            { a: 'Chunk size per invocation',    b: '50 items per batch-worker call' },
            { a: 'Concurrency per chunk',        b: '8 Paystack transfers in parallel' },
            { a: 'Time budget per call',         b: '120 seconds (edge function cap is 150 s)' },
            { a: 'Client-side iterations',       b: 'Up to 20 invocations from BatchDetail; each continues until all items done' },
            { a: 'Orphan watchdog',              b: 'pg_cron fires batch-worker every minute — picks up any batch in processing > 60 s old' },
            { a: 'Double-payment guard',         b: 'Optimistic concurrency: claim processing only if status IN (funded, partially_processed). Row count 0 → abort.' },
            { a: 'BatchDetail polling interval', b: '15 s → 30 s → 60 s → 120 s (exponential backoff)' },
            { a: 'Polling stops after',          b: '30 minutes of no progress (manual refresh still works)' },
            { a: 'Polling pauses when',          b: 'Browser tab is hidden' },
            { a: 'Reconciliation threshold',     b: 'Re-checks any transfer stuck in "pending" for more than 1 hour' },
            { a: 'Reconciliation cap per run',   b: '200 items (rate-limit guard)' },
            { a: 'Manual reconcile button',      b: 'Payments page → "Reconcile" (top-right)' },
          ]}
        />
      </RefSection>

      <RefSection icon={CreditCard} title="Paystack fee display">
        <RefTable
          cols={['Setting', 'Value']}
          rows={[
            { a: 'Fee column on BatchDetail',   b: 'Shown per batch item. Falls back gracefully if webhook has not yet fired.' },
            { a: 'Fee source 1 (best)',         b: 'paystack_fee_ngn — written by the transfer.success webhook' },
            { a: 'Fee source 2 (fallback)',     b: 'paystack_raw.fee ÷ 100 — raw Paystack JSON, kobo → naira' },
            { a: 'Fee source 3 (estimate)',     b: 'Tier estimate for succeeded items: min(₦2,000, max(₦50, amount × 1.5%))' },
            { a: 'Fee for non-succeeded items', b: '— (dash) — not charged yet' },
            { a: 'Fee for in-flight items',     b: '... (three dots) — transfer dispatched but webhook pending' },
          ]}
        />
      </RefSection>

      <RefSection icon={Database} title="Query limits (Payments module)">
        <RefTable
          cols={['Query', 'Limit']}
          rows={[
            { a: 'Approvals — payment batches',         b: '200 rows' },
            { a: 'Dashboard — processed batches (KPI)', b: '500 rows' },
          ]}
        />
      </RefSection>
    </>
  );
}
