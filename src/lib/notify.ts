import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/db-errors';
import { toTermiiNumber } from '@/lib/phone';
import {
  renderTemplate,
  type NotificationTemplateKind,
  type NotificationPayloadOf,
} from '@/lib/notify-templates';

/**
 * Send an in-app notification to a specific user. A DB trigger
 * (notifications_push_fanout) fans out a native push automatically on
 * every insert into public.notifications — no client-side push call
 * needed here. Best-effort — never throws.
 */
export async function notifyUser(opts: {
  userId: string;
  type: string;
  module?: string;
  priority?: 'normal' | 'high';
  title: string;
  body: string;
}): Promise<void> {
  try {
    await supabase.from('notifications').insert({
      user_id: opts.userId,
      type: opts.type,
      module: opts.module || null,
      priority: opts.priority || 'normal',
      title: opts.title,
      body: opts.body,
    });
  } catch {
    // Best-effort — never block the calling action.
  }
}

/**
 * Send a notification to every user matching any of the given roles.
 * Useful for "notify all Finance and Admin users".
 */
export async function notifyRoles(opts: {
  roles: string[];
  type: string;
  module?: string;
  priority?: 'normal' | 'high';
  title: string;
  body: string;
}): Promise<void> {
  try {
    const { data: users } = await supabase
      .from('profiles_directory')
      .select('id')
      .in('role', opts.roles)
      .eq('status', 'active');
    if (!users || users.length === 0) return;
    const rows = users.map((u: any) => ({
      user_id: u.id,
      type: opts.type,
      module: opts.module || null,
      priority: opts.priority || 'normal',
      title: opts.title,
      body: opts.body,
    }));
    await supabase.from('notifications').insert(rows);
  } catch {
    // Best-effort.
  }
}

// ---------------------------------------------------------------------------
// Multi-channel notification (in-app + email + SMS + WhatsApp via Termii)
// ---------------------------------------------------------------------------

/** Notification categories that map onto the columns in notification_preferences. */
export type NotificationCategory =
  | 'payslip'
  | 'payments'
  | 'ewa'
  | 'leave'
  | 'approvals'
  | 'compliance'
  | 'fleet';

interface ProfileLite {
  id: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
}

interface ChannelPrefs {
  whatsapp: boolean;
  sms: boolean;
}

/**
 * Resolve the channel toggles for a user from notification_preferences.
 * Defaults to all-on if the user has no row yet (matches the table defaults).
 */
async function resolveChannelPrefs(
  userId: string,
  category: NotificationCategory,
): Promise<ChannelPrefs> {
  try {
    const { data } = await supabase
      .from('notification_preferences')
      .select(`whatsapp_${category}, sms_${category}`)
      .eq('user_id', userId)
      .maybeSingle();
    const wsKey = `whatsapp_${category}`;
    const smsKey = `sms_${category}`;
    return {
      whatsapp: data ? (data as any)[wsKey] !== false : true,
      sms: data ? (data as any)[smsKey] === true : false,
    };
  } catch {
    return { whatsapp: true, sms: false };
  }
}

/** Idempotency-respecting log insert. Returns the new log row id, or null on collision. */
async function logSend(row: {
  user_id: string | null;
  channel: 'in_app' | 'email' | 'sms' | 'whatsapp';
  template_kind: string;
  payload: any;
  to_address: string | null;
  status: 'queued' | 'sent' | 'failed' | 'skipped';
  provider_id?: string | null;
  error_message?: string | null;
  idempotency_key?: string | null;
}): Promise<void> {
  try {
    await supabase.from('notifications_log').insert({
      ...row,
      sent_at: row.status === 'sent' ? new Date().toISOString() : null,
    });
  } catch {
    // Logging is best-effort. Don't fail the send because audit failed.
  }
}

/**
 * Send a templated notification to a user across every channel they've opted
 * into. Always writes the in-app row; WhatsApp / SMS depend on prefs + a
 * valid phone number. Email is left to existing call-sites for now.
 *
 * Returns silently. Failures are logged in notifications_log but never thrown
 * — notification delivery should never block the originating action.
 */
export async function notifyChannels<K extends NotificationTemplateKind>(opts: {
  user: ProfileLite;
  category: NotificationCategory;
  kind: K;
  payload: NotificationPayloadOf<K>;
  /** Optional dedup key — same key within 24h is treated as a duplicate. */
  idempotencyKey?: string;
  /** Override channels (default: respect notification_preferences). */
  forceChannels?: Partial<ChannelPrefs & { in_app: boolean }>;
}): Promise<void> {
  if (!opts.user?.id) return;

  const rendered = renderTemplate(opts.kind, opts.payload as any);
  const prefs = await resolveChannelPrefs(opts.user.id, opts.category);
  const chans = {
    in_app: opts.forceChannels?.in_app ?? true,
    whatsapp: opts.forceChannels?.whatsapp ?? prefs.whatsapp,
    sms: opts.forceChannels?.sms ?? prefs.sms,
  };

  // 1. In-app — always write unless explicitly disabled.
  if (chans.in_app) {
    await notifyUser({
      userId: opts.user.id,
      type: opts.kind,
      module: opts.category,
      title: rendered.title,
      body: rendered.body,
    });
    await logSend({
      user_id: opts.user.id,
      channel: 'in_app',
      template_kind: opts.kind,
      payload: opts.payload,
      to_address: null,
      status: 'sent',
      idempotency_key: opts.idempotencyKey ? `${opts.idempotencyKey}:in_app` : null,
    });
  }

  // 2. WhatsApp / SMS via Termii (through the send-email edge function).
  const termiiNumber = toTermiiNumber(opts.user.phone);
  if (!termiiNumber) {
    if (chans.whatsapp || chans.sms) {
      await logSend({
        user_id: opts.user.id,
        channel: chans.whatsapp ? 'whatsapp' : 'sms',
        template_kind: opts.kind,
        payload: opts.payload,
        to_address: opts.user.phone ?? null,
        status: 'skipped',
        error_message: 'No valid Nigerian mobile number on file',
        idempotency_key: opts.idempotencyKey ? `${opts.idempotencyKey}:phone` : null,
      });
    }
    return;
  }

  const sendOne = async (channel: 'whatsapp' | 'sms') => {
    try {
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          channel,
          to: termiiNumber,
          message: rendered.body,
        },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.ok === false) throw new Error((data as any)?.error ?? 'Send failed');
      await logSend({
        user_id: opts.user.id,
        channel,
        template_kind: opts.kind,
        payload: opts.payload,
        to_address: termiiNumber,
        status: (data as any)?.dev_skip ? 'skipped' : 'sent',
        provider_id: (data as any)?.message_id ?? null,
        idempotency_key: opts.idempotencyKey ? `${opts.idempotencyKey}:${channel}` : null,
      });
    } catch (err: unknown) {
      await logSend({
        user_id: opts.user.id,
        channel,
        template_kind: opts.kind,
        payload: opts.payload,
        to_address: termiiNumber,
        status: 'failed',
        error_message: errorMessage(err),
        idempotency_key: opts.idempotencyKey ? `${opts.idempotencyKey}:${channel}` : null,
      });
    }
  };

  const tasks: Promise<void>[] = [];
  if (chans.whatsapp) tasks.push(sendOne('whatsapp'));
  if (chans.sms) tasks.push(sendOne('sms'));
  await Promise.allSettled(tasks);
}
