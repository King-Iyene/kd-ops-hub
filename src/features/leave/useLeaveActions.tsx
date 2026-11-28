// One place that runs a leave action, tells the person what happened, emails the employee, and refreshes the screens.
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { confirm } from '@/hooks/use-confirm';
import { useAuthStore } from '@/store/authStore';
import { emailEmployee, leaveApi, type LeaveFields, type LeaveResult } from './leaveApi';
import { useLookups } from './useLookups';
import type { LeaveRow } from './types';

export function useLeaveActions() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const lookups = useLookups();
  const me = useAuthStore((s) => s.profile);
  const byName = me?.full_name ?? 'An admin';

  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: ['leave'] }), [qc]);

  const finish = useCallback(
    <T,>(r: LeaveResult<T>, okTitle: string, okBody?: string): LeaveResult<T> => {
      if (r.ok) {
        toast({ title: okTitle, description: okBody });
        void refresh();
      } else if (!r.error.overBalance) {
        toast({ title: 'That did not work', description: r.error.message, variant: 'destructive' });
      }
      return r;
    },
    [toast, refresh],
  );

  const mail = useCallback(
    (kind: Parameters<typeof emailEmployee>[0], row: LeaveRow, note?: string | null) => {
      const isMe = row.employee_id === me?.id;
      if (!isMe) void emailEmployee(kind, row, lookups.person(row.employee_id), byName, note);
    },
    [lookups, byName, me?.id],
  );

  const who = (row: LeaveRow) => lookups.nameOf(row.employee_id);

  return {
    refresh,
    submit: async (f: LeaveFields) => finish(await leaveApi.submit(f), 'Request sent', 'The admins have been told. You will be notified when it is decided.'),

    approve: async (row: LeaveRow, note: string | null = null, override = false) => {
      const r = await leaveApi.review(row.id, 'approve', note, override);
      if (r.ok) mail('approved', { ...row, ...r.data }, note);
      return finish(r, 'Approved', `${who(row)} has been told.`);
    },
    /** Approve; if it is more annual leave than earned so far, ask once and allow it only if the admin agrees. */
    approveAsking: async (row: LeaveRow): Promise<boolean> => {
      let r = await leaveApi.review(row.id, 'approve', null, false);
      if (!r.ok && r.error.overBalance) {
        const yes = await confirm({
          title: 'More than they have earned so far',
          description: `${r.error.message} Approve it anyway?`,
          confirmLabel: 'Approve anyway',
        });
        if (!yes) return false;
        r = await leaveApi.review(row.id, 'approve', null, true);
      }
      if (r.ok) mail('approved', { ...row, ...r.data }, null);
      return finish(r, 'Approved', `${who(row)} has been told.`).ok;
    },
    reject: async (row: LeaveRow, reason: string) => {
      const r = await leaveApi.review(row.id, 'reject', reason);
      if (r.ok) mail('rejected', row, reason);
      return finish(r, 'Not approved', `${who(row)} has been told why.`);
    },
    edit: async (row: LeaveRow, f: LeaveFields, note: string | null, override = false) => {
      const r = await leaveApi.edit(row.id, f, note, override);
      if (r.ok) mail('edited', { ...row, ...r.data }, note);
      return finish(r, 'Leave updated', `${who(row)} has been told. Their balance was adjusted.`);
    },
    cancel: async (row: LeaveRow, reason: string | null) => {
      const r = await leaveApi.cancel(row.id, reason);
      if (r.ok) mail('cancelled', row, reason);
      return finish(r, 'Leave cancelled', row.status === 'approved' ? 'The days went back to the balance.' : undefined);
    },
    revert: async (row: LeaveRow, note: string | null) => {
      const r = await leaveApi.revert(row.id, note);
      if (r.ok) mail('reverted', row, note);
      return finish(r, 'Moved back to pending', row.status === 'approved' ? 'The days went back to the balance.' : undefined);
    },
    record: async (employeeId: string, f: LeaveFields, status: 'approved' | 'pending', override = false) => {
      const r = await leaveApi.record(employeeId, f, status, override);
      if (r.ok) {
        const person = lookups.person(employeeId);
        void emailEmployee('recorded', { leave_type: f.type, start_date: f.start, end_date: f.end, days_requested: 0 }, person, byName, f.reason ?? null);
      }
      return finish(r, status === 'approved' ? 'Leave added' : 'Request added', `${lookups.nameOf(employeeId)} has been told.`);
    },
    remove: async (row: LeaveRow) => {
      const ok = await confirm({
        title: 'Delete this leave?',
        description: `${who(row)}'s leave will disappear from every list${row.status === 'approved' ? ' and the days go back to their balance' : ''}. The history stays on record.`,
        confirmLabel: 'Delete',
        variant: 'destructive',
      });
      if (!ok) return { ok: false, data: undefined, error: { message: 'cancelled', overBalance: false } } as LeaveResult<void>;
      return finish(await leaveApi.remove(row.id, null), 'Leave deleted');
    },
    addNote: async (row: LeaveRow, note: string) => finish(await leaveApi.addNote(row.id, note), 'Note saved'),
    adjust: async (employeeId: string, year: number, field: string, value: number, reason: string) =>
      finish(await leaveApi.adjust(employeeId, year, field, value, reason), 'Balance updated', 'The change and your reason are kept in the history.'),
  };
}
