import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useAgentModules } from '@/queries/useOpsAgent';
import { useAgentRules, useUpdateRule } from '@/queries/useOpsAgentV4';
import type { AgentRule } from '../agentDb';
import { settingsPath } from '../agentTabs';
import { SeverityPill } from '../inbox/severity';
import { Section, Stat, SummaryStrip } from './shared';
import { useAgentToast } from './useAgentToast';

const STATUS_NOTE: Record<string, string> = { waiting_for_data: 'Waiting for data', reserved: 'Reserved', later_phase: 'Later phase' };

/** The few numbers a person may tune on a rule. Everything else in `params` is left alone. */
const NUMERIC = /(^|_)(days|hours|minutes|min_chars|share)$/;
export const numericParams = (params: Record<string, unknown> | null | undefined): [string, number][] =>
  Object.entries(params ?? {}).filter((e): e is [string, number] => typeof e[1] === 'number' && NUMERIC.test(e[0]));

/** Why a typed number is not allowed, or null when it is fine. A share is a fraction (0 to 1) when it is stored as one. */
export function paramProblem(key: string, text: string, current: number): string | null {
  const n = Number(text);
  if (text.trim() === '' || !Number.isFinite(n)) return 'Enter a number.';
  if (n < 0) return 'Use zero or more.';
  if (key.endsWith('share')) { const max = current <= 1 ? 1 : 100; return n > max ? `Use ${max} or less.` : null; }
  if (/(days|min_chars)$/.test(key) && !Number.isInteger(n)) return 'Use a whole number.';
  if (n > 10_000) return 'That is too large.';
  return null;
}

const humanKey = (k: string) => k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

function ParamField({ rule, name, value, disabled, onSave }: { rule: string; name: string; value: number; disabled: boolean; onSave: (name: string, n: number) => void }) {
  const [text, setText] = useState(String(value));
  const problem = text === String(value) ? null : paramProblem(name, text, value);
  const commit = () => {
    if (text === String(value)) return;
    if (paramProblem(name, text, value)) return;
    onSave(name, Number(text)); // only a changed, valid value is saved
  };
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span>{humanKey(name)}</span>
      <Input
        type="number" inputMode="decimal" step="any" value={text} disabled={disabled} aria-label={`${rule} ${humanKey(name)}`} aria-invalid={!!problem}
        className="h-7 w-20 px-2 text-xs" onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
      />
      {problem && <span className="text-destructive" role="alert">{problem}</span>}
    </label>
  );
}

function RuleRow({ rule, disabled, busy, onToggle, onParam }: {
  rule: AgentRule; disabled: boolean; busy: boolean; onToggle: (r: AgentRule, on: boolean) => void; onParam: (r: AgentRule, name: string, n: number) => void;
}) {
  const nums = numericParams(rule.params);
  return (
    <li className="space-y-1.5 py-3" data-testid={`rule-${rule.code}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-2xs text-muted-foreground">{rule.code}</span>
            <span className="text-sm font-medium">{rule.title}</span>
            <SeverityPill severity={rule.severity} />
            {STATUS_NOTE[rule.status] && <span className="rounded-full bg-muted px-2 py-0.5 text-2xs font-medium text-muted-foreground">{STATUS_NOTE[rule.status]}</span>}
          </div>
          {rule.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground"><span className="font-medium text-foreground/70">Checks:</span> {rule.description}</p>}
        </div>
        <Switch checked={rule.enabled} disabled={disabled || busy} aria-label={`${rule.title} (${rule.code})`} onCheckedChange={(on) => onToggle(rule, on)} />
      </div>
      {nums.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {nums.map(([k, v]) => <ParamField key={`${k}-${v}`} rule={rule.code} name={k} value={v} disabled={disabled || busy} onSave={(name, n) => onParam(rule, name, n)} />)}
        </div>
      )}
    </li>
  );
}

/** Every check the agent runs, from the database, grouped by module. Switching a rule off or on takes effect on the next check. */
export function MonitoringRulesCard({ readOnly }: { readOnly: boolean }) {
  const rules = useAgentRules();
  const modules = useAgentModules();
  const update = useUpdateRule();
  const toast = useAgentToast();
  const moduleOn = useMemo(() => new Map((modules.data ?? []).map((m) => [m.key, m.enabled])), [modules.data]);

  const groups = useMemo(() => {
    const order = new Map((modules.data ?? []).map((m, i) => [m.key, i]));
    const label = new Map((modules.data ?? []).map((m) => [m.key, m.label]));
    const by = new Map<string, AgentRule[]>();
    for (const r of rules.data ?? []) by.set(r.module_key ?? '', [...(by.get(r.module_key ?? '') ?? []), r]);
    return [...by.entries()]
      .map(([key, list]) => ({ key, label: key ? label.get(key) ?? key : 'General', rank: key ? order.get(key) ?? 998 : 999, rules: list }))
      .sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label));
  }, [rules.data, modules.data]);

  if (rules.isLoading || modules.isLoading) return <Skeleton className="h-48 w-full" />;
  if (rules.isError) return <p className="text-sm text-destructive" role="alert">The rules could not be loaded: {rules.error.message}. Refresh the page to try again.</p>;
  const all = rules.data ?? [];

  const toggle = (r: AgentRule, on: boolean) =>
    update.mutate({ code: r.code, patch: { enabled: on } }, { onSuccess: () => toast.saved(`${r.code} ${on ? 'on' : 'off'}`), onError: toast.failed });
  const setParam = (r: AgentRule, name: string, n: number) =>
    update.mutate({ code: r.code, patch: { params: { ...r.params, [name]: n } } }, { onSuccess: () => toast.saved(`${r.code} updated`), onError: toast.failed });

  return (
    <>
      <SummaryStrip aria-label="Rules summary">
        <Stat label="Rules on" value={<>{all.filter((r) => r.enabled).length} <span className="text-sm font-normal text-muted-foreground">of {all.length}</span></>} />
        <Stat label="Modules" value={groups.length} />
      </SummaryStrip>
      {groups.map((g) => {
        const off = g.key !== '' && moduleOn.get(g.key) === false;
        return (
          <Section key={g.key || 'general'} title={g.label} description={`${g.rules.filter((r) => r.enabled).length} of ${g.rules.length} on`}>
            {off && (
              <p className="rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-xs" data-testid={`module-off-${g.key}`}>
                Module is off: <Link to={settingsPath('coverage')} className="font-medium underline underline-offset-2">switch it on in Coverage</Link>. You can still change each rule here.
              </p>
            )}
            <ul className="-my-2 divide-y">
              {g.rules.map((r) => <RuleRow key={r.code} rule={r} disabled={readOnly} busy={update.isPending} onToggle={toggle} onParam={setParam} />)}
            </ul>
          </Section>
        );
      })}
      {all.length === 0 && <p className="text-sm text-muted-foreground">No rules are set up yet.</p>}
    </>
  );
}
