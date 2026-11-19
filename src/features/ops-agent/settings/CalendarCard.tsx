import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAgentPeople, useReportTables, useUpdateAgentSettings } from '@/queries/useOpsAgent';
import { COMMON_TIMEZONES, WEEKDAYS, hhmm, isValidTimezone, type AgentSettings } from '../agentDb';
import { useSettingsDraft } from './settingsDraft';
import { Field, SaveBar, Section } from './shared';
import { useAgentToast } from './useAgentToast';

const NONE = '__none';

export function CalendarCard({ settings, readOnly }: { settings: AgentSettings; readOnly: boolean }) {
  const d = useSettingsDraft<'timezone' | 'report_deadline' | 'default_working_days' | 'default_work_start' | 'default_work_end' | 'default_country_code' | 'report_table_id' | 'hr_contact_id'>(settings);
  const update = useUpdateAgentSettings();
  const toast = useAgentToast();
  const tables = useReportTables();
  const people = useAgentPeople();

  const tz = d.value('timezone');
  const tzBad = !isValidTimezone(tz);
  const zones = COMMON_TIMEZONES.includes(tz) ? COMMON_TIMEZONES : [tz, ...COMMON_TIMEZONES];
  const days = d.value('default_working_days');
  const toggleDay = (n: number) => d.set('default_working_days', days.includes(n) ? days.filter((x) => x !== n) : [...days, n].sort());
  const country = d.value('default_country_code');
  const countryBad = !/^[A-Za-z]{2}$/.test(country);
  const timeFor = (k: 'report_deadline' | 'default_work_start' | 'default_work_end') => hhmm(d.value(k));
  const setTime = (k: 'report_deadline' | 'default_work_start' | 'default_work_end', v: string) => { if (/^\d{2}:\d{2}$/.test(v)) d.set(k, v); };
  const invalid = tzBad || countryBad || days.length === 0;

  const save = () => update.mutate(d.patch, { onSuccess: () => { d.reset(); toast.saved('Business calendar saved'); }, onError: toast.failed });

  return (
    <Section
      title="Business calendar and report"
      description="When a daily report is due, who works when, and where the reports live. A person can override the working days, hours and time zone in People below."
      footer={<SaveBar dirty={d.dirty && !invalid} saving={update.isPending} onSave={save} onCancel={d.reset} readOnly={readOnly} />}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Deadline time zone" htmlFor="cal-tz" hint={tzBad ? undefined : 'Report deadlines and "today" follow this zone.'}>
          <Select value={tz} onValueChange={(v) => d.set('timezone', v)} disabled={readOnly}>
            <SelectTrigger id="cal-tz"><SelectValue /></SelectTrigger>
            <SelectContent>{zones.map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Report deadline" htmlFor="cal-deadline">
          <Input id="cal-deadline" type="time" value={timeFor('report_deadline')} disabled={readOnly} onChange={(e) => setTime('report_deadline', e.target.value)} />
        </Field>
        <Field label="Default country" htmlFor="cal-country" hint={countryBad ? 'Use a two letter code such as NG or US.' : 'Picks the public holidays to skip.'}>
          <Input id="cal-country" value={country} maxLength={2} disabled={readOnly} aria-invalid={countryBad}
            onChange={(e) => d.set('default_country_code', e.target.value.toUpperCase())} />
        </Field>
      </div>

      <Field label="Default working days" hint={days.length === 0 ? 'Pick at least one day.' : undefined}>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Default working days">
          {WEEKDAYS.map(({ n, short }) => (
            <button
              key={n} type="button" disabled={readOnly} aria-pressed={days.includes(n)} onClick={() => toggleDay(n)}
              className={`rounded-md border px-3 py-1 text-sm transition-colors disabled:cursor-not-allowed ${days.includes(n) ? 'border-primary bg-primary/10 font-medium' : 'text-muted-foreground hover:bg-muted/50'}`}
            >{short}</button>
          ))}
        </div>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Work day starts" htmlFor="cal-start"><Input id="cal-start" type="time" value={timeFor('default_work_start')} disabled={readOnly} onChange={(e) => setTime('default_work_start', e.target.value)} /></Field>
        <Field label="Work day ends" htmlFor="cal-end"><Input id="cal-end" type="time" value={timeFor('default_work_end')} disabled={readOnly} onChange={(e) => setTime('default_work_end', e.target.value)} /></Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Daily report table" htmlFor="cal-report" hint="The Task module table people fill in each day.">
          <Select value={d.value('report_table_id') ?? NONE} onValueChange={(v) => d.set('report_table_id', v === NONE ? null : v)} disabled={readOnly}>
            <SelectTrigger id="cal-report"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Not chosen</SelectItem>
              {(tables.data ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="HR contact" htmlFor="cal-hr" hint="Who escalations to HR are drafted to.">
          <Select value={d.value('hr_contact_id') ?? NONE} onValueChange={(v) => d.set('hr_contact_id', v === NONE ? null : v)} disabled={readOnly}>
            <SelectTrigger id="cal-hr"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Not chosen</SelectItem>
              {(people.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name ?? 'Unnamed'}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </div>
    </Section>
  );
}
