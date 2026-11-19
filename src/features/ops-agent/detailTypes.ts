// What the database function agent_flag_detail(p_flag) returns, and the answers of the edge functions the detail sheet calls.
import type { AgentFlag } from './agentDb';
import type { FlagEvidence, SiteCategory } from './liveTypes';

export type SiteVerdict = 'work' | 'personal' | 'unknown';

export interface DetailSite {
  domain: string;
  seconds: number;
  category: SiteCategory;
  /** Where the site sits on the saved site list; null when nobody has classified it. */
  list: SiteCategory | null;
  hint?: { verdict: SiteVerdict; reason: string } | null;
  days_seen?: number | null;
  team_users?: number | null;
}

export interface DetailPerson {
  id: string; full_name: string | null; email?: string | null; photo_url: string | null; job_title: string | null;
  manager: { id: string; full_name: string | null; photo_url: string | null } | null;
}

export interface DetailToday {
  tracked_minutes: number; tracking_now: boolean; open_tasks: number; overdue_tasks: number; reported_today: boolean; on_leave: boolean;
}

export interface DetailRecurrence { window_days: number; count_in_window: number; label: string; dates: string[]; total: number }

export interface DetailDraft {
  to: 'person' | 'manager'; recipient_name: string | null; recipient_email?: string | null; recipient_id: string | null; subject: string; body: string;
}

export interface TimelineEvent { kind: string; at: string; actor: string | null; detail: Record<string, unknown> | null }
export interface SentMessage { id: string; channel: string; status: string; body: string | null; recipient: string | null; sent_at: string | null; error: string | null }

export type DetailFlag = Pick<AgentFlag, 'id' | 'rule_code' | 'severity' | 'status' | 'title' | 'why' | 'suggested_action' | 'occurrence_count' | 'escalation_level' | 'first_seen_at' | 'last_seen_at' | 'subject_type' | 'subject_id' | 'item_type'>
  & { evidence?: FlagEvidence | null; resolution_note?: string | null; snoozed_until?: string | null; period_key?: string | null };

/** Where the item lives in KD Ops. `path` is for navigating inside the app, `url` is the full address that goes in messages. */
export interface DetailLink { label: string; path: string; url?: string | null; person_path?: string | null; person_url?: string | null; inbox_url?: string | null }

export interface FlagDetail {
  flag: DetailFlag;
  person: DetailPerson | null;
  today: DetailToday | null;
  recurrence: DetailRecurrence | null;
  sites: DetailSite[];
  draft: DetailDraft | null;
  link?: DetailLink | null;
  timeline: TimelineEvent[];
  messages: SentMessage[];
}

/** `close: false` keeps the item open; left out, a sent message marks it handled. */
export interface SendFlagInput { flag_id: string; channel: 'email' | 'connection'; connection_id?: string; subject: string; text: string; close?: boolean }
export interface SendFlagResult { ok: boolean; closed?: boolean; error?: string }

export interface SiteVerdictResult { domain: string; verdict: SiteVerdict; reason: string }
