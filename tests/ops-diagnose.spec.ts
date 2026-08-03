import { test } from '@playwright/test';

/**
 * Ops diagnostic — calls a Supabase Edge Function through the authenticated
 * browser session (same session global-setup.ts creates) and prints the raw
 * JSON result to the Playwright/CI log.
 *
 * Replaces the manual "paste JS into browser console" / "run SQL in
 * Supabase SQL Editor" workflow that was slow and error-prone (e.g. pasting
 * JS into the SQL Editor by mistake). This runs the SAME call, through the
 * SAME authenticated session as the real app, but from CI — no copy-paste,
 * no context-switching between tabs.
 *
 * Usage (from a workflow_dispatch input, or locally):
 *   OPS_FUNCTION=flutterwave-reconciliation OPS_BODY='{}' npx playwright test ops-diagnose
 *   OPS_FUNCTION=batch-worker OPS_BODY='{"batch_id":"<uuid>"}' npx playwright test ops-diagnose
 *   OPS_RPC=pending_batches_list OPS_BODY='{}' npx playwright test ops-diagnose
 *
 * Env vars:
 *   OPS_FUNCTION — name of the edge function to invoke. Required unless OPS_RPC is set.
 *   OPS_RPC      — name of a Postgres RPC to call via supabase.rpc() instead of
 *                  an edge function. Takes precedence over OPS_FUNCTION if both are set.
 *   OPS_BODY     — optional JSON string body / RPC params. Defaults to '{}'.
 */
test('invoke an edge function or RPC and print the result', async ({ page }) => {
  const fn = process.env.OPS_FUNCTION;
  const rpc = process.env.OPS_RPC;
  if (!fn && !rpc) {
    throw new Error('Set OPS_FUNCTION (edge function) or OPS_RPC (Postgres RPC) to diagnose.');
  }
  let body: unknown = {};
  if (process.env.OPS_BODY) {
    try {
      body = JSON.parse(process.env.OPS_BODY);
    } catch {
      throw new Error(`OPS_BODY is not valid JSON: ${process.env.OPS_BODY}`);
    }
  }

  // Land on any authenticated page so `supabase` is loaded in the page context
  // with the real session from tests/.auth/user.json.
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');

  const result = await page.evaluate(
    async ({ fnName, rpcName, fnBody }) => {
      // Exposed by src/integrations/supabase/client.ts ONLY when the build
      // sets VITE_EXPOSE_TEST_HOOKS=true (this workflow's build step does;
      // the real Vercel production build never does).
      const supabase = (window as any).__kdops_supabase__;
      if (!supabase) {
        return { ok: false, error: 'window.__kdops_supabase__ not found — is the dev-global exposed?' };
      }
      const { data, error } = rpcName
        ? await supabase.rpc(rpcName, fnBody)
        : await supabase.functions.invoke(fnName, { body: fnBody });
      return { ok: !error, data, error: error ? String((error as any).message || error) : null };
    },
    { fnName: fn, rpcName: rpc, fnBody: body },
  );

  console.log('═══════════════════════════════════════════════════════════');
  console.log(`OPS DIAGNOSE: ${rpc ? `rpc:${rpc}` : fn}`);
  console.log('Body:  ', JSON.stringify(body));
  console.log('Result:', JSON.stringify(result, null, 2));
  console.log('═══════════════════════════════════════════════════════════');
});
