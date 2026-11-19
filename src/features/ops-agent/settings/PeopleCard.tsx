import { useMemo, useState } from 'react';
import { Loader2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useAgentPeople, usePersonProfiles, useSavePersonProfile, useSuggestProfiles, type AgentPerson } from '@/queries/useOpsAgent';
import { COMMON_TIMEZONES, GROUP_LABEL, WEEKDAYS, hhmm, isValidTimezone, type AgentGroup, type AgentPersonProfile, type AgentSettings } from '../agentDb';
import { PersonAvatar } from '../PersonAvatar';
import { useKdTeam } from '@/queries/useOpsAgentLive';
import { Field, Section } from './shared';
import { useAgentToast } from './useAgentToast';

const NONE = '__none';
const EXEMPTIONS: { key: string; label: string }[] = [
  { key: 'reports', label: 'Not expected to send a daily report' },
  { key: 'tasks', label: 'Not expected to have tasks' },
  { key: 'time', label: 'Not expected to track time' },
];

type Draft = Partial<Omit<AgentPersonProfile, 'person_id'>>;
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function PersonRow({ person, saved, people, readOnly }: { person: Pick<AgentPerson, 'id' | 'full_name' | 'job_title' | 'role'>; saved: AgentPersonProfile | undefined; people: Pick<AgentPerson, 'id' | 'full_name'>[]; readOnly: boolean }) {
  const [draft, setDraft] = useState<Draft>({});
  const [open, setOpen] = useState(false);
  const save = useSavePersonProfile();
  const toast = useAgentToast();

  const v = <K extends keyof Draft>(k: K): Draft[K] => (k in draft ? draft[k] : (saved?.[k] as Draft[K]));
  const set = <K extends keyof Draft>(k: K, value: Draft[K]) =>
    setDraft((d) => {
      const next = { ...d };
      if (same(value, saved?.[k])) delete next[k]; else next[k] = value;
      return next;
    });
  const dirty = Object.keys(draft).length > 0;
  const tz = v('timezone') ?? '';
  const tzBad = tz !== '' && !isValidTimezone(tz);
  const exemptions = (v('exemptions') ?? {}) as Record<string, boolean>;
  const days = v('working_days') ?? [];

  const onSave = () => {
    const patch: Draft = { ...draft };
    if ('group_name' in patch) patch.group_source = 'manual'; // a group chosen by hand is never overwritten by "Fill from pay groups"
    save.mutate({ person_id: person.id, ...patch }, { onSuccess: () => { setDraft({}); toast.saved(`${person.full_name ?? 'Person'} saved`); }, onError: toast.failed });
  };

  return (
    <li className="py-3" data-testid="agent-person">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-[11rem] flex-1 items-center gap-3">
          <PersonAvatar name={person.full_name} photoUrl={person.photo_url} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{person.full_name ?? 'Unnamed'}</p>
            <p className="truncate text-xs text-muted-foreground">{person.job_title ?? person.role ?? ''}{saved?.group_source === 'manual' && saved.group_name ? ' · group set by hand' : ''}</p>
          </div>
        </div>
        <Select value={v('group_name') ?? NONE} onValueChange={(g) => set('group_name', g === NONE ? null : (g as AgentGroup))} disabled={readOnly}>
          <SelectTrigger className="h-9 w-36" aria-label={`${person.full_name} group`}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>No group</SelectItem>
            {(Object.keys(GROUP_LABEL) as AgentGroup[]).map((g) => <SelectItem key={g} value={g}>{GROUP_LABEL[g]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={v('manager_id') ?? NONE} onValueChange={(m) => set('manager_id', m === NONE ? null : m)} disabled={readOnly}>
          <SelectTrigger className="h-9 w-44" aria-label={`${person.full_name} manager`}><SelectValue placeholder="Manager" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>No manager</SelectItem>
            {people.filter((p) => p.id !== person.id).map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name ?? 'Unnamed'}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>{open ? 'Less' : 'More'}</Button>
        {!readOnly && dirty && (
          <>
            <Button size="sm" onClick={onSave} disabled={save.isPending || tzBad}>{save.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft({})} disabled={save.isPending}>Discard</Button>
          </>
        )}
      </div>

      {open && (
        <div className="mt-3 grid gap-4 rounded-lg bg-muted/30 p-4 sm:grid-cols-2">
          <Field label="Time zone" htmlFor={`tz-${person.id}`} hint={tzBad ? 'That is not a time zone name (for example Africa/Lagos).' : 'Blank uses the default from the business calendar.'}>
            <Input id={`tz-${person.id}`} list="agent-tz-list" value={tz} disabled={readOnly} aria-invalid={tzBad} placeholder="Default"
              onChange={(e) => set('timezone', e.target.value.trim() === '' ? null : e.target.value.trim())} />
          </Field>
          <Field label="Country" htmlFor={`cc-${person.id}`} hint="Blank uses the default country.">
            <Input id={`cc-${person.id}`} maxLength={2} value={v('country_code') ?? ''} disabled={readOnly} placeholder="Default"
              onChange={(e) => set('country_code', e.target.value.trim() === '' ? null : e.target.value.toUpperCase())} />
          </Field>
          <Field label="Working days" hint="None selected uses the default working days.">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={`${person.full_name} working days`}>
              {WEEKDAYS.map(({ n, short }) => (
                <button key={n} type="button" disabled={readOnly} aria-pressed={days.includes(n)}
                  onClick={() => { const next = days.includes(n) ? days.filter((x) => x !== n) : [...days, n].sort(); set('working_days', next.length === 0 ? null : next); }}
                  className={`rounded-md border px-2 py-0.5 text-xs disabled:cursor-not-allowed ${days.includes(n) ? 'border-primary bg-primary/10 font-medium' : 'text-muted-foreground'}`}>{short}</button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Starts" htmlFor={`ws-${person.id}`}><Input id={`ws-${person.id}`} type="time" value={hhmm(v('work_start'))} disabled={readOnly} onChange={(e) => set('work_start', e.target.value || null)} /></Field>
            <Field label="Ends" htmlFor={`we-${person.id}`}><Input id={`we-${person.id}`} type="time" value={hhmm(v('work_end'))} disabled={readOnly} onChange={(e) => set('work_end', e.target.value || null)} /></Field>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <p className="text-sm font-medium">Exemptions</p>
            {EXEMPTIONS.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <Checkbox checked={!!exemptions[key]} disabled={readOnly}
                  onCheckedChange={(c) => { const next = { ...exemptions }; if (c === true) next[key] = true; else delete next[key]; set('exemptions', next); }} />
                {label}
              </label>
            ))}
          </div>
          <Field label="Notes" htmlFor={`notes-${person.id}`}>
            <Textarea id={`notes-${person.id}`} rows={2} value={v('notes') ?? ''} disabled={readOnly} onChange={(e) => set('notes', e.target.value === '' ? null : e.target.value)} />
          </Field>
        </div>
      )}
    </li>
  );
}

export function PeopleCard({ settings: _settings, readOnly }: { settings: AgentSettings; readOnly: boolean }) {
  const kd = useKdTeam();
  const everyone = useAgentPeople(); // managers can be anyone, so the manager list is not limited to the KD Squares team
  const profiles = usePersonProfiles();
  const suggest = useSuggestProfiles();
  const toast = useAgentToast();
  const [q, setQ] = useState('');
  const byPerson = useMemo(() => new Map((profiles.data ?? []).map((p) => [p.person_id, p])), [profiles.data]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return kd.team.filter((p) => !needle || (p.full_name ?? '').toLowerCase().includes(needle));
  }, [kd.team, q]);

  const fill = () => suggest.mutate(undefined, {
    onSuccess: (r) => toast.saved(`Filled ${r.written} people. Kept ${r.kept_manual} you set by hand. Skipped ${r.skipped_no_company} with no company.`),
    onError: toast.failed,
  });
  const ungrouped = kd.team.filter((p) => !byPerson.get(p.id)?.group_name).length;
  const loading = kd.isLoading || profiles.isLoading;
  const failure = kd.error ?? profiles.error;

  return (
    <Section
      title="People"
      description="Each person's group, manager, hours and exemptions. The rules use these to decide who is expected to report, track time or have tasks."
    >
      <datalist id="agent-tz-list">{COMMON_TIMEZONES.map((z) => <option key={z} value={z} />)}</datalist>
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Search people" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 max-w-xs" aria-label="Search people" />
        {!readOnly && (
          <Button size="sm" variant="outline" onClick={fill} disabled={suggest.isPending} data-testid="fill-groups">
            {suggest.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-2 h-3.5 w-3.5" />}
            Fill from pay groups and placements
          </Button>
        )}
      </div>
      <p className="-mt-2 text-xs text-muted-foreground" data-testid="team-note">
        KD Squares team, Field Agents excluded · <span className="tabular-nums">{kd.team.length}</span> {kd.team.length === 1 ? 'person' : 'people'}
        {ungrouped > 0 && !loading && <> · <span className="tabular-nums">{ungrouped}</span> without a group are not checked by the rules</>}
      </p>
      {loading ? <Skeleton className="h-32 w-full" /> : failure ? (
        <p className="text-sm text-destructive" role="alert">People could not be loaded: {failure.message}. Refresh the page; if it keeps happening, check your connection.</p>
      ) : list.length === 0 ? <p className="text-sm text-muted-foreground">{q ? 'No one on the team matches that search.' : 'No one is on the KD Squares team yet. People need an active profile and a KD Squares pay group.'}</p> : (
        <ul className="-my-3 divide-y">
          {list.map((p) => <PersonRow key={p.id} person={p} saved={byPerson.get(p.id)} people={everyone.data ?? kd.team} readOnly={readOnly} />)}
        </ul>
      )}
    </Section>
  );
}
