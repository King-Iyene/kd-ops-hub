// Ops Agent: who is calling an agent function. The role always comes from the database (agent_my_scope), read with
// the caller's own token, so a forged or stale browser claim changes nothing.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

export interface AgentCaller {
  userId: string;
  canConfigure: boolean;
  /** A client acting as the caller: row level security and agent_in_scope apply to everything it does. */
  asUser: SupabaseClient;
}

export type AuthResult = { ok: true; caller: AgentCaller } | { ok: false; status: 401 | 403; error: 'unauthorized' | 'forbidden' };

export async function authenticateAgentCaller(req: Request): Promise<AuthResult> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.toLowerCase().startsWith('bearer ')) return { ok: false, status: 401, error: 'unauthorized' };
  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await asUser.auth.getUser(auth.slice(7));
  if (userError || !userData?.user) return { ok: false, status: 401, error: 'unauthorized' };
  const { data: scope, error: scopeError } = await asUser.rpc('agent_my_scope');
  if (scopeError || !scope?.access) return { ok: false, status: 403, error: 'forbidden' };
  return { ok: true, caller: { userId: userData.user.id, canConfigure: scope.configure === true, asUser } };
}

export function jsonResponse(headers: Record<string, string>, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}
