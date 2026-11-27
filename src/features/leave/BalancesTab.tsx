// Everyone's leave balance in one table. Admins can correct a number, with a reason that is kept.
import { useMemo, useState } from 'react';
import { History, Loader2, Pencil, Search } from 'lucide-react';
import { ResponsiveDialog } from '@/components/ui-kit/ResponsiveDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useBalanceHistory, useBalances } from './leaveApi';
import { annualPosition, titleCase } from './leaveMath';
import { PersonAvatar } from './leaveUi';
import { useLookups } from './useLookups';
import { useLeaveActions } from './useLeaveActions';
import type { BalanceRow, Person } from './types';

const FIELDS: { value: string; label: string; hint: string }[] = [
  { value: 'annual_quota', label: 'Yearly annual allowance', hint: 'How many annual days they get this year in total.' },
  { value: 'annual_used', label: 'Annual days used', hint: 'Fix this if days were taken before KD Ops, or counted wrongly.' },
  { value: 'sick_used', label: 'Sick days used', hint: '' },
  { value: 'unpaid_used', label: 'Unpaid days used', hint: '' },
  { value: 'maternity_used', label: 'Maternity days used', hint: '' },
  { value: 'paternity_used', label: 'Paternity days used', hint: '' },
  { value: 'compassionate_used', label: 'Compassionate days used', hint: '' },
  { value: 'study_used', label: 'Study days used', hint: '' },
];

export function BalancesTab() {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data: balances, isLoading } = useBalances(year, undefined, true);
  const lookups = useLookups();
  const [q, setQ] = useState('');
  const [adjusting, setAdjusting] = useState<Person | null>(null);
  const defaultQuota = lookups.types.find((t) => t.code === 'annual')?.default_days ?? 20;

  const people = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return lookups.people
      .filter((p) => (p.status ?? 'active') !== 'inactive' && p.role !== 'contractor')
      .filter((p) => !needle || (p.full_name ?? '').toLowerCase().includes(needle));
  }, [lookups.people, q]);
  const byEmp = useMemo(() => new Map((balances ?? []).map((b) => [b.employee_id, b])), [balances]);
  const thisYear = new Date().getFullYear();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a person" className="pl-9" aria-label="Find a person" />
        </div>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-[120px]" aria-label="Year"><SelectValue /></SelectTrigger>
          <SelectContent>{[thisYear + 1, thisYear, thisYear - 1, thisYear - 2].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <p className="text-sm text-muted-foreground">Annual leave is earned a little every month (the yearly allowance divided by 12), so “can take now” is what they have earned so far, minus what they used.</p>

      {isLoading ? <Skeleton className="h-64 w-full" /> : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Person</th>
                <th className="px-3 py-2.5 text-right font-medium">Yearly allowance</th>
                <th className="px-3 py-2.5 text-right font-medium">Used</th>
                <th className="px-3 py-2.5 text-right font-medium">Can take now</th>
                <th className="px-3 py-2.5 text-right font-medium">Sick used</th>
                <th className="px-3 py-2.5 text-right font-medium">Other used</th>
                <th className="w-10 px-3 py-2.5"><span className="sr-only">Change</span></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {people.map((p) => {
                const b = byEmp.get(p.id) ?? null;
                const pos = annualPosition(b, defaultQuota, year, p.start_date);
                const other = b ? Number(b.unpaid_used ?? 0) + Number(b.maternity_used ?? 0) + Number(b.paternity_used ?? 0) + Number(b.compassionate_used ?? 0) + Number(b.study_used ?? 0) : 0;
                return (
                  <tr key={p.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2.5"><div className="flex items-center gap-2.5"><PersonAvatar name={p.full_name} photo={p.photo_url} className="h-8 w-8" /><span className="font-medium">{p.full_name ?? p.email}</span></div></td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{pos.quota}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{pos.used}</td>
                    <td className={cn('px-3 py-2.5 text-right font-semibold tabular-nums', pos.left === 0 && 'text-amber-700 dark:text-amber-300')}>{pos.left}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{Number(b?.sick_used ?? 0)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{other}</td>
                    <td className="px-3 py-2.5 text-right"><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setAdjusting(p)} aria-label={`Change ${p.full_name ?? 'their'} balance`}><Pencil className="h-4 w-4" /></Button></td>
                  </tr>
                );
              })}
              {people.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">Nobody found.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <AdjustDialog person={adjusting} year={year} balance={adjusting ? byEmp.get(adjusting.id) ?? null : null} defaultQuota={defaultQuota} onClose={() => setAdjusting(null)} />
    </div>
  );
}

function AdjustDialog({ person, year, balance, defaultQuota, onClose }: { person: Person | null; year: number; balance: BalanceRow | null; defaultQuota: number; onClose: () => void }) {
  const actions = useLeaveActions();
  const lookups = useLookups();
  const [field, setField] = useState('annual_quota');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const { data: history } = useBalanceHistory(person?.id ?? null, year);

  const current = field === 'annual_quota' ? balance?.annual_quota ?? defaultQuota : Number((balance as unknown as Record<string, number | null> | null)?.[field] ?? 0);
  const next = value.trim() === '' ? null : Number(value);
  const valid = next !== null && Number.isFinite(next) && next >= 0 && next <= 400 && reason.trim().length >= 3 && next !== current;
  const hint = FIELDS.find((f) => f.value === field)?.hint;

  const save = async () => {
    if (!person || !valid || next === null) return;
    setBusy(true);
    try {
      const r = await actions.adjust(person.id, year, field, next, reason.trim());
      if (r.ok) { setValue(''); setReason(''); onClose(); }
    } finally { setBusy(false); }
  };

  return (
    <ResponsiveDialog
      open={!!person} onOpenChange={(o) => { if (!o && !busy) onClose(); }}
      title={person ? `${person.full_name}: change balance` : 'Change balance'} description={`${year}. Every change is saved with your reason and they are told.`} size="md"
      footer={<><Button variant="outline" onClick={onClose} disabled={busy}>Back</Button><Button onClick={save} disabled={!valid || busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save change</Button></>}
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <p className="text-sm font-medium">What do you want to change?</p>
          <Select value={field} onValueChange={(v) => { setField(v); setValue(''); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{FIELDS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
          </Select>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">New number of days <span className="font-normal text-muted-foreground">(now {current})</span></p>
          <Input type="number" inputMode="decimal" min={0} max={400} step={0.5} value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Why?</p>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: 3 days taken in January before KD Ops" />
        </div>
        {(history ?? []).length > 0 && (
          <div className="rounded-xl bg-muted/40 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><History className="h-3.5 w-3.5" />Earlier changes</p>
            <ul className="space-y-1.5 text-xs">
              {(history ?? []).slice(0, 5).map((h) => (
                <li key={h.id}>{titleCase(h.field.replace('_used', ' used').replace('_quota', ' allowance'))}: {h.old_value ?? 0} to {h.new_value} by {lookups.nameOf(h.actor_id)} <span className="text-muted-foreground">({formatDateTime(h.created_at)}): {h.reason}</span></li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </ResponsiveDialog>
  );
}
