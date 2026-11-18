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
 *   OPS_TABLE=custom_field_definitions OPS_BODY='{"limit":5}' npx playwright test ops-diagnose
 *
 * Env vars:
 *   OPS_FUNCTION — name of the edge function to invoke. Required unless OPS_RPC/OPS_TABLE is set.
 *   OPS_RPC      — name of a Postgres RPC to call via supabase.rpc() instead of
 *                  an edge function. Takes precedence over OPS_FUNCTION if both are set.
 *   OPS_TABLE    — name of a table to run a read-only select() on instead of an
 *                  RPC or edge function. Takes precedence over both. OPS_BODY's
 *                  "columns" (default '*') and "limit" (default 10) keys apply.
 *   OPS_BODY     — optional JSON string body / RPC params. Defaults to '{}'.
 */
test('invoke an edge function, RPC, or table select and print the result', async ({ page }) => {
  const fn = process.env.OPS_FUNCTION;
  const rpc = process.env.OPS_RPC;
  const table = process.env.OPS_TABLE;
  if (!fn && !rpc && !table) {
    throw new Error('Set OPS_FUNCTION (edge function), OPS_RPC (Postgres RPC), or OPS_TABLE (read-only select) to diagnose.');
  }
  let body: Record<string, unknown> = {};
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
    async ({ fnName, rpcName, tableName, fnBody }) => {
      // Exposed by src/integrations/supabase/client.ts ONLY when the build
      // sets VITE_EXPOSE_TEST_HOOKS=true (this workflow's build step does;
      // the real Vercel production build never does).
      const supabase = (window as any).__kdops_supabase__;
      if (!supabase) {
        return { ok: false, error: 'window.__kdops_supabase__ not found — is the dev-global exposed?' };
      }
      if (tableName) {
        const columns = (fnBody as Record<string, unknown>).columns || '*';
        const limit = (fnBody as Record<string, unknown>).limit || 10;
        const { data, error } = await supabase
          .from(tableName)
          .select(columns as string)
          .limit(limit as number);
        return { ok: !error, data, error: error ? String((error as any).message || error) : null };
      }
      const { data, error } = rpcName
        ? await supabase.rpc(rpcName, fnBody)
        : await supabase.functions.invoke(fnName, { body: fnBody });
      return { ok: !error, data, error: error ? String((error as any).message || error) : null };
    },
    { fnName: fn, rpcName: rpc, tableName: table, fnBody: body },
  );

  console.log('═══════════════════════════════════════════════════════════');
  console.log(`OPS DIAGNOSE: ${table ? `table:${table}` : rpc ? `rpc:${rpc}` : fn}`);
  console.log('Body:  ', JSON.stringify(body));
  console.log('Result:', JSON.stringify(result, null, 2));
  console.log('═══════════════════════════════════════════════════════════');
});
