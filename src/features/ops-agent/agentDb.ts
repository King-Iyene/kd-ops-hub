// The agent_* tables are newer than the generated database types, so the agent screens talk to them through an
// untyped client. Every row shape the screens use is declared in this file instead.
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { AuthType, ConnectionKind, ContentType } from './connectionPresets';

export type { ConnectionKind };

export const adb = supabase as unknown as SupabaseClient;

export type AgentMode = 'observe' | 'remind' | 'enforce';
export type AgentGroup = 'leadership' | 'core' | 'placement';

export interface ModelPrice { input?: number; output?: number; cache_read?: number; cache_write?: number }

export interface AgentSettings {
  id: true;
  mode: AgentMode;
  ai_enabled: boolean;
  model_fast: string;
  model_smart: string;
  model_prices: Record<string, ModelPrice>;
  monthly_ai_budget_usd: number;
  daily_ai_budget_usd: number;
  timezone: string;
  report_deadline: string;
  default_working_days: number[];
  default_work_start: string;
  default_work_end: string;
  default_country_code: string;
  report_table_id: string | null;
  hr_contact_id: string | null;
  hide_own_flags: boolean;
  leadership_flags_super_admin_only: boolean;
  readonly_query_enabled: boolean;
  escalation_window_days: number;
  operating_rules: string;
  updated_at: string;
}

export interface AgentScope {
  role: string | null;
  access: boolean;
  configure?: boolean;
  companies?: string[] | null;
  modules?: string[] | null;
}

export interface AgentModule { key: string; label: string; description: string; sensitive: boolean; sort_order: number; enabled: boolean }
export interface AgentCompanyScope { company_id: string; enabled: boolean }
export interface AgentPersonProfile {
  person_id: string;
  group_name: AgentGroup | null;
  group_source: 'auto' | 'manual';
  manager_id: string | null;
  timezone: string | null;
  country_code: string | null;
  working_days: number[] | null;
  work_start: string | null;
  work_end: string | null;
  exemptions: Record<string, boolean>;
  notes: string | null;
}
/** How a person is tagged in Cliq and Slack. `email` is only a fallback the server may use. */
export interface AgentIdentity { person_id: string; cliq_user_id: string | null; slack_user_id: string | null; email?: string | null; matched_by?: 'auto' | 'manual' }
export interface AgentAdminScope { admin_id: string; company_ids: string[] | null; module_keys: string[] | null }
export interface AgentAuditRow { id: number; at: string; actor_id: string | null; action: string; entity_type: string | null; entity_id: string | null; detail: Record<string, unknown> }
export interface AgentUsageRow { id: string; created_at: string; feature: string; model: string; input_tokens: number; output_tokens: number; cost_usd: number; ok: boolean; error: string | null }
export interface AgentBudget { level: 'ok' | 'warn' | 'off'; ai_enabled: boolean; spent_today_usd: number; spent_month_usd: number; daily_budget_usd: number; monthly_budget_usd: number }
export interface AiStatus { key_configured: boolean; key_source: 'env' | 'vault' | null; ai_enabled: boolean; models: { fast: string; smart: string }; budget: AgentBudget }
export interface AiTestResult { ok: boolean; reason?: string; error?: string | null; model?: string; text?: string; cost_usd?: number; key_configured?: boolean }
export interface KeyResult { ok: boolean; reason?: string; error?: string }

export interface AgentFlag {
  id: string; company_id: string | null; module: string | null; rule_code: string; severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  subject_type: string; subject_id: string; person_id: string | null; manager_id: string | null; title: string; why: string;
  suggested_action: string | null; draft_message: string | null; escalation_level: number; occurrence_count: number;
  first_seen_at: string; last_seen_at: string; status: 'open' | 'snoozed' | 'handled' | 'dismissed' | 'auto_resolved'; item_type: string;
}
export interface AgentSummary { id: string; period_kind: string; period_start: string; period_end: string; company_id: string | null; narrative: string | null; auto: boolean; created_at: string; metrics?: SummaryMetrics | null }

/** The numbers inside a summary (see the header of the agent_summaries migration). Older rows may lack any part of this. */
export interface SummaryMetrics {
  headline?: string; team_size?: number; working_days?: number;
  tracking?: { expected_days?: number; tracked_days?: number; hours?: number; avg_hours_per_day?: number; low_days?: number };
  tasks?: { completed?: number; created?: number; overdue?: number; in_review?: number; blocked?: number };
  reports?: { expected?: number; submitted?: number; missing?: { person_id: string; name: string; days: number }[] };
  flags?: { opened?: number; high?: number; resolved?: number; open_now?: number; by_rule?: Record<string, number> };
  repeat?: { person_id: string; name: string; rule: string; count: number }[];
  sites?: { domain: string; minutes: number; people: number }[];
  /** Daily summaries made before the 6:30 PM change carry `today`; newer ones carry `tomorrow`. Both are read. */
  today?: { due_today?: number; on_leave?: number };
  tomorrow?: { due_tomorrow?: number; on_leave?: number };
}

export interface AgentRule {
  code: string; module_key: string | null; title: string; description: string; enabled: boolean;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical'; params: Record<string, unknown>;
  status: 'ready' | 'waiting_for_data' | 'reserved' | 'later_phase'; status_note?: string | null;
}
export type MemoryType = 'fact' | 'correction' | 'preference' | 'exemption' | 'rule';
export type MemoryScope = 'global' | 'company' | 'person' | 'module';
export type MemoryStatus = 'proposed' | 'active' | 'rejected' | 'archived';
export interface AgentMemory {
  id: string; type: MemoryType | string; content: string; detail?: string | null; scope: MemoryScope | string; scope_ref: string | null;
  source: string; source_thread?: string | null; status: MemoryStatus; created_at: string; updated_at?: string | null;
}
/** A "Remember this?" suggestion the chat attaches to an answer. The row is already saved as 'proposed'. */
export interface MemorySuggestion { id: string; type: MemoryType | string; content: string; detail?: string | null; scope: MemoryScope | string; scope_ref?: string | null }
export type MinSeverity = 'low' | 'medium' | 'high' | 'critical';
export interface AgentConnection {
  id: string; kind: ConnectionKind | 'whatsapp'; name: string; status: 'disconnected' | 'connected' | 'error';
  config: {
    url?: string; host?: string; to?: string; chat_id?: string; method?: string; header_name?: string; query_param?: string; preset?: string;
    auth_type?: AuthType; content_type?: ContentType; body_template?: string; extra_headers?: Record<string, string>;
    events?: string[]; min_severity?: MinSeverity;
    /** Cliq and Slack only: tag the person a message is about. */
    mention_people?: boolean; mention_template?: string;
    /** Cliq: `api` posts through the Cliq REST API after a Zoho sign-in, `webhook` (the default) uses a webhook address. */
    mode?: 'webhook' | 'api'; dc?: string; client_id?: string; channel?: string;
    /** Cliq and Slack: also tag the manager of the person a message is about. */
    cc_manager?: boolean;
  };
  vault_secret_names: string[]; last_error: string | null; last_tested_at: string | null; last_sent_at?: string | null;
}
export interface SaveConnectionInput {
  id?: string; kind: ConnectionKind; name: string; preset?: string; url?: string; token?: string; clear_token?: boolean; to?: string; chat_id?: string;
  method?: string; auth_type?: AuthType; header_name?: string; query_param?: string; content_type?: ContentType; extra_headers?: Record<string, string>;
  body_template?: string; events?: string[]; min_severity?: MinSeverity; mention_people?: boolean; mention_template?: string;
  /** Cliq. `api` needs dc, client_id, channel, a client_secret and a grant_code or refresh_token (on create); `url` is not used. The three secrets are write only. */
  mode?: 'webhook' | 'api'; dc?: string; client_id?: string; client_secret?: string; grant_code?: string; refresh_token?: string; channel?: string;
  cc_manager?: boolean;
}
/** One delivery the agent tried (or will try) to a connection. Read from agent_outbox when allowed. */
export interface OutboxRow { id: string; connection_id: string; kind: 'flag' | 'summary'; ref_id: string | null; status: 'pending' | 'sent' | 'failed'; attempts: number; error: string | null; created_at: string; sent_at: string | null }
export interface AgentApiKey { id: string; name: string; key_prefix: string; scopes: string[]; rate_limit_per_min: number; created_at: string; last_used_at: string | null; revoked_at: string | null }
export interface ChatThread { id: string; title: string; updated_at: string }
export interface ChatMessage { id: string; thread_id: string; role: 'user' | 'assistant' | 'tool'; content: string; tool_calls: string[] | null; created_at: string }
export interface ChatReply { ok: boolean; thread_id?: string; reply?: string; tools_used?: string[]; title?: string; reason?: string; message?: string; memory_suggestions?: MemorySuggestion[] }

export const CONNECTION_KINDS: { kind: ConnectionKind; label: string; help: string }[] = [
  { kind: 'slack', label: 'Slack', help: 'Posts to a channel through an incoming webhook.' },
  { kind: 'cliq', label: 'Zoho Cliq', help: 'Posts to a Cliq channel through the Cliq API (sign in with Zoho) or through a webhook address.' },
  { kind: 'discord', label: 'Discord', help: 'Posts to a channel through a webhook.' },
  { kind: 'teams', label: 'Microsoft Teams', help: 'Posts to a channel through a workflow webhook.' },
  { kind: 'gchat', label: 'Google Chat', help: 'Posts to a space through a webhook.' },
  { kind: 'telegram', label: 'Telegram', help: 'Messages a chat or group through a bot.' },
  { kind: 'email', label: 'Email', help: 'Sends a message to one to five addresses.' },
  { kind: 'webhook', label: 'Webhook', help: 'Sends a signed JSON message to any address.' },
  { kind: 'n8n', label: 'n8n', help: 'Starts an n8n workflow through its webhook trigger.' },
  { kind: 'api', label: 'API', help: 'Calls any HTTPS API with a token.' },
];

export const WEEKDAYS: { n: number; short: string }[] = [
  { n: 1, short: 'Mon' }, { n: 2, short: 'Tue' }, { n: 3, short: 'Wed' }, { n: 4, short: 'Thu' }, { n: 5, short: 'Fri' }, { n: 6, short: 'Sat' }, { n: 7, short: 'Sun' },
];

/** Time columns come back as HH:MM:SS; the inputs want HH:MM. */
export const hhmm = (t: string | null | undefined) => (t ?? '').slice(0, 5);

export const GROUP_LABEL: Record<AgentGroup, string> = { leadership: 'Leadership', core: 'Core team', placement: 'Placement' };

export const usd = (n: number | null | undefined, digits = 2) =>
  `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

/** A small, readable list of IANA zones for the pickers. */
export const COMMON_TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Africa/Lagos', 'Africa/Accra', 'Africa/Nairobi',
  'Europe/London', 'Europe/Paris', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Manila', 'UTC',
];

export function isValidTimezone(tz: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}
