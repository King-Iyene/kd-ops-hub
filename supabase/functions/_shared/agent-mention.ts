// Ops Agent: finds who to tag for a person (see agent-mention-core.ts for the rules).
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { pickMentionId, type Mention, type MentionKind } from './agent-mention-core.ts';

export async function mentionFor(db: SupabaseClient, kind: string, personId: string | null | undefined): Promise<Mention | undefined> {
  if ((kind !== 'cliq' && kind !== 'slack') || !personId) return undefined;
  const [{ data: p }, { data: i }] = await Promise.all([
    db.from('profiles').select('full_name, email').eq('id', personId).maybeSingle(),
    db.from('agent_identity_map').select('cliq_user_id, slack_user_id, email').eq('person_id', personId).maybeSingle(),
  ]);
  if (!p) return undefined;
  const id = pickMentionId(kind as MentionKind, i, p.email);
  return id ? { name: p.full_name as string, id } : undefined;
}
