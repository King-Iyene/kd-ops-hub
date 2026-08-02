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
 *
 * Env vars:
 *   OPS_FUNCTION — required. Name of the edge function to invoke.
 *   OPS_BODY     — optional JSON string body. Defaults to '{}'.
 */
test('invoke an edge function and print the result', async ({ page }) => {
  const fn = process.env.OPS_FUNCTION;
  if (!fn) {
    throw new Error('Set OPS_FUNCTION to the edge function name you want to diagnose.');
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
    async ({ fnName, fnBody }) => {
      // Exposed by src/integrations/supabase/client.ts ONLY when the build
      // sets VITE_EXPOSE_TEST_HOOKS=true (this workflow's build step does;
      // the real Vercel production build never does).
      const supabase = (window as any).__kdops_supabase__;
      if (!supabase) {
        return { ok: false, error: 'window.__kdops_supabase__ not found — is the dev-global exposed?' };
      }
      const { data, error } = await supabase.functions.invoke(fnName, { body: fnBody });
      return { ok: !error, data, error: error ? String((error as any).message || error) : null };
    },
    { fnName: fn, fnBody: body },
  );

  console.log('═══════════════════════════════════════════════════════════');
  console.log(`OPS DIAGNOSE: ${fn}`);
  console.log('Body:  ', JSON.stringify(body));
  console.log('Result:', JSON.stringify(result, null, 2));
  console.log('═══════════════════════════════════════════════════════════');
});
