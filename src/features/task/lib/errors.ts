/** A raw Postgrest/Postgres error message is accurate but not actionable
 *  for most people ('new row violates row-level security policy for
 *  table "tk_spaces"' says nothing about what to actually do). Recognise
 *  the one class of error every Task mutation can hit — a permission
 *  check rejecting an action the UI should have already hidden — and
 *  say what to do instead. Everything else still shows the real message,
 *  since that's the best information available for an unexpected error. */
export function friendlyErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string } | null | undefined)?.code;
  if (code === '42501' || /row-level security policy/i.test(message)) {
    return "You don't have permission to do this. Ask a workspace admin.";
  }
  return message;
}
