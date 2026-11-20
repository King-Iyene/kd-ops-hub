// Ops Agent: finds who to tag for a person (see agent-mention-core.ts for the rules), and who their manager is.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { pickMentionId, type Mention, type MentionKind } from './agent-mention-core.ts';

/**
 * Who to tag for a person in Cliq or Slack. Always names the person; `id` is empty when we have nothing safe to tag with
 * (the message then shows the plain name instead of a tag).
 */
export async function mentionFor(db: SupabaseClient, kind: string, personId: string | null | undefined): Promise<Mention | undefined> {
  if ((kind !== 'cliq' && kind !== 'slack') || !personId) return undefined;
  const [{ data: p }, { data: i }] = await Promise.all([
    db.from('profiles').select('full_name, email').eq('id', personId).maybeSingle(),
    db.from('agent_identity_map').select('cliq_user_id, slack_user_id, email').eq('person_id', personId).maybeSingle(),
  ]);
  if (!p) return undefined;
  return { name: (p.full_name as string) ?? 'Someone', id: pickMentionId(kind as MentionKind, i, p.email) ?? '' };
}

/** The person's manager: the one set in Settings, People, else the staff profile's, else the department head (agent_manager_of). */
export async function managerOf(db: SupabaseClient, personId: string | null | undefined): Promise<string | null> {
  if (!personId) return null;
  const { data } = await db.rpc('agent_manager_of', { p_person: personId });
  return typeof data === 'string' ? data : null;
}

/** The manager to CC for a person (null when they have none, or it is the person already being tagged). */
export async function ccFor(db: SupabaseClient, kind: string, personId: string | null | undefined, alreadyTagged?: string | null): Promise<Mention | undefined> {
  const managerId = await managerOf(db, personId);
  if (!managerId || managerId === personId || managerId === alreadyTagged) return undefined;
  return mentionFor(db, kind, managerId);
}
