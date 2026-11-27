// One form for three jobs: ask for leave (everyone), add leave for someone (admins), change a leave (admins).
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, Info, Loader2 } from 'lucide-react';
import { ResponsiveDialog } from '@/components/ui-kit/ResponsiveDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { useAllLeave, useBalances, useHolidays, useMyLeave } from './leaveApi';
import {
  annualPosition, daysLabel, isoDate, overlaps, requestedDays, rangeLabel, skippedDays, usedFor,
} from './leaveMath';
import { useLeaveActions } from './useLeaveActions';
import { useLookups } from './useLookups';
import type { LeaveRow } from './types';

export type RequestMode = 'request' | 'record' | 'edit';

export function RequestDialog({ open, mode, row, personId: presetPerson, onClose, onDone }: {
  open: boolean;
  mode: RequestMode;
  /** the leave being changed (edit mode) */
  row?: LeaveRow | null;
  /** pre-select a person (record mode) */
  personId?: string | null;
  onClose: () => void;
  onDone?: () => void;
}) {
  const me = useAuthStore((s) => s.profile);
  const actions = useLeaveActions();
  const lookups = useLookups();
  const { data: holidays } = useHolidays();
  const isAdminMode = mode !== 'request';

  const today = isoDate(new Date());
  const [personId, setPersonId] = useState<string>('');
  const [type, setType] = useState('annual');
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [half, setHalf] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<'approved' | 'pending'>('approved');
  const [busy, setBusy] = useState(false);
  const [needsOverride, setNeedsOverride] = useState<string | null>(null);

  // Start fresh every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setNeedsOverride(null);
    setNote('');
    if (mode === 'edit' && row) {
      setPersonId(row.employee_id); setType(row.leave_type); setStart(row.start_date); setEnd(row.end_date);
      setHalf(!!row.is_half_day); setReason(row.reason ?? ''); setStatus('approved');
    } else {
      setPersonId(mode === 'request' ? me?.id ?? '' : presetPerson ?? '');
      setType('annual'); setStart(today); setEnd(today); setHalf(false); setReason(''); setStatus('approved');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, row?.id, presetPerson]);

  const hol = holidays ?? new Set<string>();
  const year = Number(start.slice(0, 4)) || new Date().getFullYear();
  const days = requestedDays(start, end, half, hol);
  const skipped = skippedDays(start, end, hol);
  const target = personId || me?.id || '';
  const person = lookups.person(target);

  const { data: balances } = useBalances(year, me?.id, isAdminMode);
  const { data: myLeave } = useMyLeave(mode === 'request' ? me?.id : undefined);
  const { data: allLeave } = useAllLeave(isAdminMode);
  const bal = (balances ?? []).find((b) => b.employee_id === target) ?? null;
  const typeInfo = lookups.types.find((t) => t.code === type);
  const defaultQuota = lookups.types.find((t) => t.code === 'annual')?.default_days ?? 20;

  const clash = useMemo(() => {
    const pool = (mode === 'request' ? myLeave : allLeave?.filter((r) => r.employee_id === target)) ?? [];
    return pool.find((r) => r.id !== row?.id && (r.status === 'pending' || r.status === 'approved') && overlaps(r, { start_date: start, end_date: end })) ?? null;
  }, [mode, myLeave, allLeave, target, row?.id, start, end]);

  const position = annualPosition(bal, defaultQuota, year, person?.start_date ?? null);
  // when editing an approved annual leave its own days are already counted as used
  const ownDays = mode === 'edit' && row?.status === 'approved' && row.leave_type === 'annual' && Number(row.start_date.slice(0, 4)) === year ? Number(row.days_requested) : 0;
  const usedBefore = Math.max(0, position.used - (type === 'annual' ? ownDays : 0));
  const leftAfter = position.earned - usedBefore - days;
  const overEarned = type === 'annual' && days > 0 && leftAfter < 0;
  const tooLongForEmployee = mode === 'request' && overEarned;

  const datesValid = !!start && !!end && end >= start;
  const problem =
    !datesValid ? 'The last day is before the first day.'
    : days <= 0 ? 'Those dates are all weekends or public holidays, so there is nothing to take off.'
    : clash ? `These dates overlap other leave (${rangeLabel(clash.start_date, clash.end_date)}).`
    : tooLongForEmployee ? `You have ${daysLabel(position.left)} available so far this year (leave is earned a little each month), and this needs ${daysLabel(days)}.`
    : isAdminMode && !target ? 'Choose who this is for.'
    : null;

  const fields = { type, start, end, half: half && start === end, reason: reason.trim() || null };

  const submit = async () => {
    if (problem || busy) return;
    setBusy(true);
    try {
      const override = needsOverride !== null;
      const r =
        mode === 'request' ? await actions.submit(fields)
        : mode === 'record' ? await actions.record(target, fields, status, override)
        : await actions.edit(row as LeaveRow, fields, note.trim() || null, override);
      if (r.ok) { setNeedsOverride(null); onDone?.(); onClose(); }
      else if (r.error.overBalance) setNeedsOverride(r.error.message);
    } finally { setBusy(false); }
  };

  const title = mode === 'request' ? 'Request leave' : mode === 'record' ? 'Add leave for someone' : 'Change this leave';
  const cta = mode === 'request' ? 'Send request' : mode === 'record' ? (status === 'approved' ? 'Add approved leave' : 'Add request') : 'Save changes';
  const sortedTypes = [...lookups.types].sort((a, b) => (a.code === 'annual' ? -1 : b.code === 'annual' ? 1 : a.code === 'sick' ? -1 : b.code === 'sick' ? 1 : a.name.localeCompare(b.name)));
  const people = lookups.people.filter((p) => (p.status ?? 'active') !== 'inactive');

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => { if (!o && !busy) onClose(); }}
      title={title}
      description={mode === 'request' ? 'Pick the dates. You will see straight away how many days it takes.' : mode === 'edit' ? 'Changing approved leave fixes their balance automatically, and they are told.' : 'Use this when someone told you about their leave. The balance is updated for you.'}
      size="lg"
      preventOutsideClose
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Back</Button>
          <Button onClick={submit} disabled={!!problem || busy} className={cn(needsOverride && 'bg-amber-600 hover:bg-amber-700')}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {needsOverride ? 'Save anyway' : cta}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {mode === 'record' && (
          <Field label="Who is it for?">
            <Select value={personId} onValueChange={setPersonId}>
              <SelectTrigger><SelectValue placeholder="Choose a person" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {people.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        )}
        {mode === 'edit' && (
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm">For <strong>{lookups.nameOf(row?.employee_id)}</strong>{row?.status === 'approved' ? ' · currently approved' : ' · waiting for approval'}</p>
        )}

        <Field label="What kind of leave?">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Kind of leave">
            {sortedTypes.map((t) => (
              <button
                key={t.code} type="button" role="radio" aria-checked={type === t.code}
                onClick={() => setType(t.code)}
                className={cn('flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors', type === t.code ? 'border-primary bg-primary/5 ring-1 ring-primary/40' : 'hover:bg-muted/60')}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: lookups.typeColor(t.code) }} aria-hidden />
                <span className="min-w-0 truncate font-medium">{t.name.replace(/ Leave$/, '')}</span>
              </button>
            ))}
          </div>
          {typeInfo?.requires_medical_cert && <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground"><Info className="h-3.5 w-3.5" />A medical note is normally needed for this kind of leave.</p>}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="First day">
            <Input type="date" value={start} onChange={(e) => { setStart(e.target.value); if (end < e.target.value) setEnd(e.target.value); }} />
          </Field>
          <Field label="Last day">
            <Input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        {start === end && (
          <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
            <span>Only half a day</span>
            <Switch checked={half} onCheckedChange={setHalf} aria-label="Only half a day" />
          </label>
        )}

        {/* The answer to "what does this do?" before anything is sent */}
        <div className={cn('rounded-xl border p-3.5', problem ? 'border-red-500/40 bg-red-500/5' : 'bg-muted/40')} aria-live="polite">
          <div className="flex items-start gap-3">
            <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0 space-y-1 text-sm">
              <p className="font-semibold">{days > 0 ? `${daysLabel(days)} off` : 'No working days'}{datesValid ? <span className="font-normal text-muted-foreground"> · {rangeLabel(start, end)}</span> : null}</p>
              {(skipped.weekends > 0 || skipped.holidays > 0) && days > 0 && (
                <p className="text-xs text-muted-foreground">Not counted: {[skipped.weekends ? `${skipped.weekends} weekend day${skipped.weekends > 1 ? 's' : ''}` : '', skipped.holidays ? `${skipped.holidays} public holiday${skipped.holidays > 1 ? 's' : ''}` : ''].filter(Boolean).join(' and ')}.</p>
              )}
              {type === 'annual' && days > 0 && (
                <p className={cn('text-xs', overEarned ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-muted-foreground')}>
                  {isAdminMode ? `${person?.full_name?.split(' ')[0] ?? 'They'} has` : 'You have'} earned {daysLabel(position.earned)} so far this year and used {daysLabel(usedBefore)}. {leftAfter >= 0 ? `${daysLabel(leftAfter)} would be left.` : `This goes ${daysLabel(-leftAfter)} past what is earned so far.`}
                </p>
              )}
              {type !== 'annual' && typeInfo && typeInfo.default_days > 0 && days > 0 && (
                <p className="text-xs text-muted-foreground">{usedFor(bal, type) ? `${daysLabel(usedFor(bal, type))} already used this year. ` : ''}Usual allowance: {daysLabel(typeInfo.default_days)} a year.</p>
              )}
            </div>
          </div>
        </div>

        {problem && <p role="alert" className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{problem}</p>}
        {needsOverride && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{needsOverride} Press <strong className="mx-1">Save anyway</strong> to allow it.
          </p>
        )}

        {mode === 'record' && (
          <Field label="Mark it as">
            <div className="grid grid-cols-2 gap-2">
              {(['approved', 'pending'] as const).map((s) => (
                <button key={s} type="button" onClick={() => setStatus(s)} className={cn('rounded-xl border px-3 py-2 text-sm font-medium transition-colors', status === s ? 'border-primary bg-primary/5 ring-1 ring-primary/40' : 'hover:bg-muted/60')}>
                  {s === 'approved' ? 'Approved already' : 'Still needs approval'}
                </button>
              ))}
            </div>
          </Field>
        )}

        <Field label={mode === 'request' ? 'Anything your manager should know? (optional)' : 'Reason (optional)'}>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={mode === 'request' ? 'For example: family wedding, handover is done' : ''} />
        </Field>
        {mode === 'edit' && (
          <Field label={`Message to ${person?.full_name?.split(' ')[0] ?? 'them'} about this change (optional)`}>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: moved by a week because of the audit" />
          </Field>
        )}
      </div>
    </ResponsiveDialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      {children}
    </div>
  );
}
