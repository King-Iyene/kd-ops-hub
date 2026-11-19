import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { useAiBudget, useAiStatus, useAiTest, useAiUsage, useUpdateAgentSettings } from '@/queries/useOpsAgent';
import { usd, type AgentSettings, type AiTestResult, type ModelPrice } from '../agentDb';
import { formatEst } from '../time';
import { useSettingsDraft } from './settingsDraft';
import { Field, Ring, SaveBar, Section, StatusPill, SummaryStrip } from './shared';
import { KeyBox } from './KeyBox';
import { useAgentToast } from './useAgentToast';

const PRICE_FIELDS: { key: keyof ModelPrice; label: string }[] = [
  { key: 'input', label: 'Input' }, { key: 'output', label: 'Output' }, { key: 'cache_read', label: 'Cache read' }, { key: 'cache_write', label: 'Cache write' },
];

const TEST_MESSAGE: Record<string, string> = {
  no_key: 'The Claude key is not set. Paste one in the box above.',
  budget_off: 'The AI budget is spent, so the test was not sent.',
  unreachable: 'The agent-ai function could not be reached. It may not be deployed yet.',
  error: 'Claude returned an error.',
};

function Meter({ label, spent, budget }: { label: string; spent: number; budget: number }) {
  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 100;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between gap-3 text-xs"><span className="font-medium">{label}</span><span className="tabular-nums text-muted-foreground">{usd(spent)} of {usd(budget)}</span></div>
      <Progress value={pct} size="sm" variant={pct >= 100 ? 'danger' : pct >= 80 ? 'warning' : 'success'} aria-label={`${label} AI spend`} />
    </div>
  );
}

/** The top of "Claude & budget": is the key working, and how much of today's and this month's budget is used. */
export function ClaudeSummary() {
  const status = useAiStatus();
  const budget = useAiBudget();
  const b = budget.data;
  const key = status.data;
  const todayPct = b && b.daily_budget_usd > 0 ? (b.spent_today_usd / b.daily_budget_usd) * 100 : b ? 100 : 0;
  return (
    <SummaryStrip data-testid={b ? 'ai-meter' : undefined} aria-label="Claude status">
      <div className="flex items-center gap-3">
        {b && <Ring pct={todayPct} label={`${Math.round(todayPct)}% of today's budget used`} />}
        <div>
          <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">Claude</p>
          <div className="mt-1">
            {status.isLoading ? <StatusPill tone="neutral">Checking</StatusPill>
              : key?.key_configured ? <StatusPill tone="good">Key working</StatusPill>
              : key ? <StatusPill tone="warn">No key yet</StatusPill>
              : <StatusPill tone="neutral">Status unknown</StatusPill>}
          </div>
          {b && <p className="mt-1 text-xs tabular-nums text-muted-foreground">{usd(b.spent_today_usd)} of {usd(b.daily_budget_usd)} today</p>}
        </div>
      </div>
      {b && (
        <div className="min-w-[12rem] flex-1 space-y-3">
          <Meter label="Today" spent={b.spent_today_usd} budget={b.daily_budget_usd} />
          <Meter label="This month" spent={b.spent_month_usd} budget={b.monthly_budget_usd} />
        </div>
      )}
    </SummaryStrip>
  );
}

export function AiCard({ settings, readOnly }: { settings: AgentSettings; readOnly: boolean }) {
  const d = useSettingsDraft<'model_fast' | 'model_smart' | 'model_prices' | 'daily_ai_budget_usd' | 'monthly_ai_budget_usd'>(settings);
  const update = useUpdateAgentSettings();
  const toast = useAgentToast();
  const usage = useAiUsage();
  const test = useAiTest();
  const [lastTest, setLastTest] = useState<{ alias: string; result: AiTestResult } | null>(null);

  const prices = d.value('model_prices');
  const fast = d.value('model_fast');
  const smart = d.value('model_smart');
  const setPrice = (model: string, key: keyof ModelPrice, raw: string) => {
    const n = raw === '' ? undefined : Number(raw);
    if (n !== undefined && (!Number.isFinite(n) || n < 0)) return;
    d.set('model_prices', { ...prices, [model]: { ...(prices[model] ?? {}), [key]: n } });
  };
  const save = () => update.mutate(d.patch, { onSuccess: () => { d.reset(); toast.saved('AI settings saved'); }, onError: toast.failed });

  const runTest = (alias: 'fast' | 'smart') => test.mutate(alias, { onSuccess: (result) => setLastTest({ alias, result }) });

  return (
    <>
      <ClaudeSummary />

      <Section title="Claude key" description="The agent finds problems with plain database rules. Claude writes things up and answers chat. It runs whenever a working key is saved.">
        <KeyBox readOnly={readOnly} />
      </Section>

      <Section
        title="Budget and models"
        description="At 80% of the daily budget background AI work pauses. At 100% all AI stops. Rules keep running."
        footer={<SaveBar dirty={d.dirty} saving={update.isPending} onSave={save} onCancel={d.reset} readOnly={readOnly} />}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Daily budget (USD)" htmlFor="ai-daily" hint="The most AI may spend in a day.">
            <Input id="ai-daily" type="number" min={0} step="0.5" value={d.value('daily_ai_budget_usd')} disabled={readOnly}
              onChange={(e) => d.set('daily_ai_budget_usd', Number(e.target.value))} />
          </Field>
          <Field label="Monthly budget (USD)" htmlFor="ai-monthly" hint="The most AI may spend in a month.">
            <Input id="ai-monthly" type="number" min={0} step="1" value={d.value('monthly_ai_budget_usd')} disabled={readOnly}
              onChange={(e) => d.set('monthly_ai_budget_usd', Number(e.target.value))} />
          </Field>
          <Field label="Fast model" htmlFor="ai-fast" hint="Used for short, frequent jobs.">
            <Input id="ai-fast" value={fast} disabled={readOnly} onChange={(e) => d.set('model_fast', e.target.value.trim())} />
          </Field>
          <Field label="Smart model" htmlFor="ai-smart" hint="Used for chat and summaries.">
            <Input id="ai-smart" value={smart} disabled={readOnly} onChange={(e) => d.set('model_smart', e.target.value.trim())} />
          </Field>
        </div>

        <div className="space-y-3 border-t pt-4">
          <div>
            <p className="text-sm font-medium">Price per million tokens (USD)</p>
            <p className="text-xs text-muted-foreground">Used to estimate cost. These are estimates; correct them if Anthropic&apos;s prices change.</p>
          </div>
          {[...new Set([fast, smart])].filter(Boolean).map((model) => (
            <div key={model} className="space-y-2">
              <p className="truncate font-mono text-xs text-muted-foreground" title={model}>{model}</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {PRICE_FIELDS.map(({ key, label }) => (
                  <Field key={key} label={label}>
                    <Input type="number" min={0} step="0.01" value={prices[model]?.[key] ?? ''} disabled={readOnly} aria-label={`${model} ${label}`} className="tabular-nums"
                      onChange={(e) => setPrice(model, key, e.target.value)} />
                  </Field>
                ))}
              </div>
              {prices[model]?.input === undefined && <p className="text-xs text-warning">No price set for this model, so its cost is logged as $0.00.</p>}
            </div>
          ))}
        </div>
      </Section>

      {!readOnly && (
        <Section title="Test the connection" description="Sends one tiny message. Costs a fraction of a cent.">
          <div className="flex flex-wrap items-center gap-2">
            {(['fast', 'smart'] as const).map((alias) => (
              <Button key={alias} size="sm" variant="outline" onClick={() => runTest(alias)} disabled={test.isPending} data-testid={`ai-test-${alias}`}>
                {test.isPending && test.variables === alias && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />} Test {alias} model
              </Button>
            ))}
          </div>
          {lastTest && (
            <p className={lastTest.result.ok ? 'text-sm text-success' : 'text-sm text-destructive'} role="status" data-testid="ai-test-result">
              {lastTest.result.ok
                ? `Connected. ${lastTest.result.model} answered "${lastTest.result.text}" (${usd(lastTest.result.cost_usd, 5)}).`
                : `${TEST_MESSAGE[lastTest.result.reason ?? 'error'] ?? 'The test failed.'}${lastTest.result.error ? ` (${lastTest.result.error})` : ''}`}
            </p>
          )}
        </Section>
      )}

      {(usage.data?.length ?? 0) > 0 && (
        <Section title="Recent AI calls" description={`The last ${usage.data!.length} calls. Times are Eastern.`}>
          <ul className="-my-1 divide-y text-xs" data-testid="ai-usage">
            {usage.data!.map((u) => (
              <li key={u.id} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 py-2 sm:grid-cols-[11rem_1fr_auto_auto]">
                <span className="text-muted-foreground">{formatEst(u.created_at)}</span>
                <span className="font-medium sm:order-none">{u.feature}{!u.ok && <span className="ml-2 font-normal text-destructive">failed</span>}</span>
                <span className="tabular-nums text-muted-foreground sm:text-right">{u.input_tokens.toLocaleString()} in / {u.output_tokens.toLocaleString()} out</span>
                <span className="text-right tabular-nums">{usd(u.cost_usd, 5)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
