// Everything the Leave screens read or change goes through this file.
// Reads are React Query hooks; every change is ONE database call (leave_* functions),
// so the request, the balance, the history and the in-app notification can never disagree.
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { sendTemplatedEmail } from '@/lib/email-templates';
import { logWarn } from '@/lib/logger';
import { useApprovalStore } from '@/store/approvalStore';
import { cleanDbMessage, isOverBalanceError, niceDate, daysLabel, titleCase } from './leaveMath';
import type { AwayRow, BalanceAdjustment, BalanceRow, LeaveEvent, LeaveRow, LeaveTypeInfo, Person } from './types';

// The leave_* tables and functions are newer than the generated database types.
const db = supabase as unknown as SupabaseClient;

const ROW_COLUMNS =
  'id, employee_id, leave_type, start_date, end_date, days_requested, is_half_day, reason, status, created_at, reviewed_by, reviewed_at, review_note, rejection_reason, cancel_reason, cancelled_by, edited_at, edited_by, source, created_by';

const KEY = 'leave';

// ── reads ───────────────────────────────────────────────────────────────────

export function useLeaveTypes() {
  return useQuery({
    queryKey: [KEY, 'types'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<LeaveTypeInfo[]> => {
      const { data, error } = await db
        .from('leave_policies')
        .select('code, name, color, default_days, accrual_type, paid, requires_medical_cert, gender, active')
        .eq('active', true)
        .order('name');
      if (error) throw error;
      return (data ?? []) as LeaveTypeInfo[];
    },
  });
}

export function useHolidays() {
  return useQuery({
    queryKey: [KEY, 'holidays'],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await db.from('public_holidays').select('holiday_date').eq('is_observed', true);
      if (error) throw error;
      return new Set(((data ?? []) as { holiday_date: string }[]).map((h) => h.holiday_date));
    },
  });
}

export function usePeople() {
  return useQuery({
    queryKey: [KEY, 'people'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Person[]> => {
      const { data, error } = await db
        .from('profiles_directory')
        .select('id, full_name, email, photo_url, role, status, start_date, job_title')
        .neq('is_anonymised', true)
        .order('full_name')
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Person[];
    },
  });
}

export function useMyLeave(userId: string | undefined) {
  return useQuery({
    queryKey: [KEY, 'mine', userId],
    enabled: !!userId,
    queryFn: async (): Promise<LeaveRow[]> => {
      const { data, error } = await db
        .from('leave_requests')
        .select(ROW_COLUMNS)
        .eq('employee_id', userId)
        .is('deleted_at', null)
        .order('start_date', { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as LeaveRow[];
    },
  });
}

/** Every leave for everyone (admins only: the database refuses anyone else). */
export function useAllLeave(enabled: boolean) {
  return useQuery({
    queryKey: [KEY, 'all'],
    enabled,
    queryFn: async (): Promise<LeaveRow[]> => {
      const { data, error } = await db
        .from('leave_requests')
        .select(ROW_COLUMNS)
        .is('deleted_at', null)
        .order('start_date', { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as LeaveRow[];
    },
  });
}

export function useBalances(year: number, userId: string | undefined, all: boolean) {
  return useQuery({
    queryKey: [KEY, 'balances', year, all ? 'all' : userId],
    enabled: all || !!userId,
    queryFn: async (): Promise<BalanceRow[]> => {
      let q = db
        .from('leave_balances')
        .select('employee_id, year, annual_quota, annual_used, sick_used, unpaid_used, maternity_used, paternity_used, compassionate_used, study_used, carryover_days')
        .eq('year', year);
      if (!all) q = q.eq('employee_id', userId);
      const { data, error } = await q.limit(5000);
      if (error) throw error;
      return (data ?? []) as BalanceRow[];
    },
  });
}

export function useAway(from: string, to: string) {
  return useQuery({
    queryKey: [KEY, 'away', from, to],
    queryFn: async (): Promise<AwayRow[]> => {
      const { data, error } = await db.rpc('leave_whos_away', { p_from: from, p_to: to });
      if (error) throw error;
      return (data ?? []) as AwayRow[];
    },
  });
}

export function useLeaveEvents(leaveId: string | null) {
  return useQuery({
    queryKey: [KEY, 'events', leaveId],
    enabled: !!leaveId,
    queryFn: async (): Promise<LeaveEvent[]> => {
      const { data, error } = await db
        .from('leave_events')
        .select('id, leave_id, actor_id, kind, from_status, to_status, note, details, created_at')
        .eq('leave_id', leaveId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as LeaveEvent[];
    },
  });
}

export function useBalanceHistory(employeeId: string | null, year: number) {
  return useQuery({
    queryKey: [KEY, 'adjustments', employeeId, year],
    enabled: !!employeeId,
    queryFn: async (): Promise<BalanceAdjustment[]> => {
      const { data, error } = await db
        .from('leave_balance_adjustments')
        .select('id, employee_id, year, field, old_value, new_value, reason, actor_id, created_at')
        .eq('employee_id', employeeId)
        .eq('year', year)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as BalanceAdjustment[];
    },
  });
}

/** Keep every Leave screen fresh when anything changes (any tab, any person). */
export function useLeaveLive() {
  const qc = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) return;
      timer = setTimeout(() => { timer = null; void qc.invalidateQueries({ queryKey: [KEY] }); }, 400);
    };
    const channel = supabase
      .channel('leave-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_balances' }, refresh)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [qc]);
}

// ── changes ─────────────────────────────────────────────────────────────────

export interface LeaveFailure { message: string; overBalance: boolean }
export type LeaveResult<T = void> = { ok: true; data: T } | { ok: false; error: LeaveFailure };

const fail = (err: unknown): { ok: false; error: LeaveFailure } => {
  const raw = (err as { message?: string })?.message ?? 'Something went wrong. Please try again.';
  return { ok: false, error: { message: cleanDbMessage(raw), overBalance: isOverBalanceError(raw) } };
};

async function call<T>(fn: string, args: Record<string, unknown>): Promise<LeaveResult<T>> {
  const { data, error } = await db.rpc(fn, args);
  if (error) return fail(error);
  void useApprovalStore.getState().refresh?.();
  return { ok: true, data: data as T };
}

export interface LeaveFields { type: string; start: string; end: string; half: boolean; reason?: string | null }

export const leaveApi = {
  submit: (f: LeaveFields) =>
    call<string>('leave_submit', { p_type: f.type, p_start: f.start, p_end: f.end, p_half: f.half, p_reason: f.reason ?? null }),
  review: (id: string, decision: 'approve' | 'reject', note: string | null, override = false) =>
    call<LeaveRow>('leave_review', { p_id: id, p_decision: decision, p_note: note, p_override: override }),
  edit: (id: string, f: LeaveFields, note: string | null, override = false) =>
    call<LeaveRow>('leave_edit', { p_id: id, p_type: f.type, p_start: f.start, p_end: f.end, p_half: f.half, p_reason: f.reason ?? null, p_note: note, p_override: override }),
  cancel: (id: string, reason: string | null) => call<LeaveRow>('leave_cancel', { p_id: id, p_reason: reason }),
  revert: (id: string, note: string | null) => call<LeaveRow>('leave_revert', { p_id: id, p_note: note }),
  record: (employeeId: string, f: LeaveFields, status: 'approved' | 'pending', override = false) =>
    call<string>('leave_record', { p_employee: employeeId, p_type: f.type, p_start: f.start, p_end: f.end, p_half: f.half, p_reason: f.reason ?? null, p_status: status, p_override: override }),
  remove: (id: string, reason: string | null) => call<void>('leave_delete', { p_id: id, p_reason: reason }),
  addNote: (id: string, note: string) => call<void>('leave_add_note', { p_id: id, p_note: note }),
  adjust: (employeeId: string, year: number, field: string, value: number, reason: string) =>
    call<void>('leave_adjust_balance', { p_employee: employeeId, p_year: year, p_field: field, p_value: value, p_reason: reason }),
};

// ── email to the employee ───────────────────────────────────────────────────
// The in-app notification (and its phone push) is created by the database in the same step as the change.
// The email is sent from here because only the app can reach the email service as the signed-in admin.
// It is best effort: an email problem never undoes or blocks a leave action.

export type EmailKind = 'approved' | 'rejected' | 'edited' | 'cancelled' | 'reverted' | 'recorded';

export async function emailEmployee(kind: EmailKind, row: Pick<LeaveRow, 'leave_type' | 'start_date' | 'end_date' | 'days_requested'>, person: Person | undefined, byName: string, note?: string | null): Promise<void> {
  try {
    if (!person?.email) return;
    const summary = `${titleCase(row.leave_type)} leave, ${niceDate(row.start_date)}${row.end_date !== row.start_date ? ` to ${niceDate(row.end_date)}` : ''} (${daysLabel(Number(row.days_requested))})`;
    const link = `${window.location.origin}/leave`;
    const name = person.full_name ?? 'there';
    if (kind === 'approved') {
      await sendTemplatedEmail({ templateKey: 'request.approved', to: person.email, vars: { requester_name: name, kind: 'leave request', summary, approver_name: byName, note: note ?? '', link } });
    } else if (kind === 'rejected') {
      await sendTemplatedEmail({ templateKey: 'request.rejected', to: person.email, vars: { requester_name: name, kind: 'leave request', summary, approver_name: byName, reason: note ?? '', link } });
    } else {
      const headline = {
        edited: 'Your leave was changed',
        cancelled: 'Your leave was cancelled',
        reverted: 'Your leave is back under review',
        recorded: 'Leave was added for you',
      }[kind];
      await sendTemplatedEmail({ templateKey: 'leave.update', to: person.email, vars: { requester_name: name, headline, summary, by_name: byName, note: note ?? '', link } });
    }
  } catch (err) {
    logWarn('Leave', 'email to employee skipped', err);
  }
}

/**
 * Approve or reject a leave from outside the Leave screens (the Approvals inbox).
 * Same single database step as everywhere else, plus the email. Throws a readable message on failure.
 */
export async function reviewLeaveFromAnywhere(id: string, decision: 'approve' | 'reject', note: string | null, byName: string): Promise<void> {
  const r = await leaveApi.review(id, decision, note, false);
  if (!r.ok) {
    throw new Error(r.error.message + (r.error.overBalance ? ' Open Leave and approve it there to allow it anyway.' : ''));
  }
  try {
    const { data } = await db.from('profiles_directory').select('id, full_name, email').eq('id', r.data.employee_id).maybeSingle();
    await emailEmployee(decision === 'approve' ? 'approved' : 'rejected', r.data, data as Person | undefined, byName, note);
  } catch (err) {
    logWarn('Leave', 'email to employee skipped', err);
  }
}
