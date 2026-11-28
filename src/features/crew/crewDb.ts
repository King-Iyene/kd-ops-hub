// The crew_* tables are newer than the generated database types, so the Crew screens talk to them through an untyped
// client. Every row shape the screens use is declared here.
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export const cdb = supabase as unknown as SupabaseClient;

export type CrewStatus = 'offline' | 'idle' | 'working' | 'thinking' | 'waiting_approval' | 'walking' | 'meeting';

export interface CrewAgent {
  id: string;
  slug: string;
  name: string;
  title: string;
  role: string;
  department: string;
  company: string;
  reports_to: string | null;
  status: CrewStatus;
  activity: string;
  last_seen_at: string | null;
  office_x: number | null;
  office_y: number | null;
  color: string;
  active: boolean;
}

export interface CrewAgentPrivate {
  agent_id: string;
  persona: string;
  instructions: string;
  notes: string;
  model: string;
  advisor_model: string | null;
  allowed_actions: string[];
  max_pending: number;
  max_runs_per_day: number | null;
}

export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'failed' | 'expired' | 'withdrawn';
export type Risk = 'low' | 'medium' | 'high';

export interface Endorsement { agent: string; stance: 'support' | 'oppose'; note: string; at: string }

export interface CrewProposal {
  id: string;
  agent_id: string;
  action: string;
  base_id: string | null;
  table_id: string | null;
  summary: string;
  rationale: string;
  evidence: Record<string, unknown>;
  payload: Record<string, unknown>;
  risk: Risk;
  status: ProposalStatus;
  requires_approver: 'owner' | 'manager_or_owner';
  endorsements: Endorsement[];
  decision_note: string | null;
  result: Record<string, unknown>;
  error: string | null;
  remind_count: number;
  created_at: string;
  decided_at: string | null;
  executed_at: string | null;
}

export type MessageKind = 'message' | 'reply' | 'report' | 'alert' | 'challenge' | 'reminder' | 'brief' | 'question';

export interface CrewMessage {
  id: string;
  thread_id: string;
  from_agent: string | null;
  to_agent: string | null;
  to_owner: boolean;
  kind: MessageKind;
  body: string;
  ref_proposal: string | null;
  ref_order: string | null;
  created_at: string;
  read_at: string | null;
  /** Set on a line said in a meeting (the Meetings tab shows those; the inbox and the team channel leave them out). Missing until the meetings migration has run. */
  meeting_id?: string | null;
  meeting_round?: number | null;
}

export type MeetingStatus = 'open' | 'summarising' | 'closed';
export interface MeetingMinutes { summary: string; decisions: string[]; needs_owner: string[]; action_items: { agent: string; task: string }[] }
export interface CrewMeeting {
  id: string;
  topic: string;
  brief: string;
  chair_agent: string;
  called_by: string | null;
  status: MeetingStatus;
  round: number;
  max_rounds: number;
  round_started_at: string;
  summarising_at: string | null;
  created_at: string;
  closed_at: string | null;
  minutes: MeetingMinutes | null;
}
export interface CrewMeetingMember { meeting_id: string; agent_id: string; spoke_round: number }

export type OrderStatus = 'given' | 'accepted' | 'challenged' | 'vetoed' | 'withdrawn' | 'done';

export interface CrewOrder {
  id: string;
  agent_id: string;
  text: string;
  status: OrderStatus;
  challenge: string | null;
  owner_response: string | null;
  created_at: string;
  responded_at: string | null;
  resolved_at: string | null;
}

export interface CrewNote {
  id: string;
  agent_id: string;
  kind: string;
  body: string;
  source: string;
  status: 'active' | 'retired';
  confidence: number;
  created_at: string;
}

export interface CrewKnowledge { topic: string; body: string; updated_at: string; updated_by_agent: string | null }

export interface CrewRun { id: string; agent_id: string; kind: string; started_at: string; finished_at: string | null; ok: boolean | null; summary: string }

export type IdeaStatus = 'open' | 'triaged' | 'approved' | 'building' | 'shipped' | 'rejected' | 'merged';
export interface IdeaSupporter { agent: string; department: string; note: string; at: string }
export interface CrewIdea {
  id: string;
  title: string;
  problem: string;
  proposal: string;
  requested_by: string | null;
  evidence: Record<string, unknown>;
  supporters: IdeaSupporter[];
  departments: string[];
  support_count: number;
  status: IdeaStatus;
  priority: 'low' | 'medium' | 'high';
  spec: string;
  estimate: string;
  owner_note: string | null;
  created_at: string;
}

export interface CrewSettings {
  id: true; cliq_enabled: boolean; cliq_connection_id: string | null; notify_profile_id: string | null; notify_kinds: MessageKind[]; owner_profile_id: string | null; office_viewers: string[]; updated_at: string;
  /** Approve, reject and reply from Cliq (off by default) and the one Cliq account that is obeyed. Missing until the migration has run. */
  cliq_commands_enabled?: boolean; cliq_owner_id?: string | null;
  /** Send to the owner as a direct message instead of a channel, and the last problem sending or reading in Cliq (plain words). Missing until the migration has run. */
  cliq_dm?: boolean; cliq_error?: string | null; cliq_error_at?: string | null;
}
export interface CliqConnection { id: string; name: string; kind: string; status?: string; config: { channel?: string; mode?: string } }

/** What an agent may do on its own inside limits the owner sets (see crew_standing_permissions). Today: post to the team in a Cliq channel. */
export type PostKindKey = 'tracking_followup' | 'announcement';
export interface StandingPermission {
  id: string; agent_id: string; kind: 'cliq_post'; connection_id: string | null; enabled: boolean; max_posts_per_day: number; allowed_kinds: PostKindKey[]; created_at: string; updated_at: string;
}
/** One post an agent made (or tried to make) under a standing permission. */
export interface CliqPostLogRow {
  id: string; agent_id: string; kind: string; body: string; tagged: { person_id: string; name: string; tagged: boolean }[]; status: 'reserved' | 'sent' | 'failed' | 'refused'; error: string | null; created_at: string; sent_at: string | null;
}

export interface CrewMistake { id: string; agent_id: string; kind: string; note: string; created_at: string; reported_by_agent: string | null; reported_by_profile: string | null }
