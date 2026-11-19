import { useState } from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { useAiBudget, useAiStatus, useAiTest, useAiUsage, useUpdateAgentSettings } from '@/queries/useOpsAgent';
import { usd, type AgentSettings, type AiTestResult, type ModelPrice } from '../agentDb';
import { useSettingsDraft } from './settingsDraft';
import { Field, SaveBar, Section } from './shared';
import { useAgentToast } from './useAgentToast';

const PRICE_FIELDS: { key: keyof ModelPrice; label: string }[] = [
  { key: 'input', label: 'Input' }, { key: 'output', label: 'Output' }, { key: 'cache_read', label: 'Cache read' }, { key: 'cache_write', label: 'Cache write' },
];

const TEST_MESSAGE: Record<string, string> = {
  no_key: 'The Claude key is not set. Add it as the ANTHROPIC_API_KEY secret in Supabase, then test again.',
  budget_off: 'The AI budget is spent, so the test was not sent.',
  unreachable: 'The agent-ai function could not be reached. It may not be deployed yet.',
  error: 'Claude returned an error.',
};

function Meter({ label, spent, budget }: { label: string; spent: number; budget: number }) {
  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 100;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm"><span>{label}</span><span className="text-muted-foreground">{usd(spent)} of {usd(budget)}</span></div>
      <Progress value={pct} className={pct >= 100 ? '[&>div]:bg-destructive' : pct >= 80 ? '[&>div]:bg-amber-500' : ''} aria-label={`${label} AI spend`} />
    </div>
  );
}

export function AiCard({ settings, readOnly }: { settings: AgentSettings; readOnly: boolean }) {
  const d = useSettingsDraft<'ai_enabled' | 'model_fast' | 'model_smart' | 'model_prices' | 'daily_ai_budget_usd' | 'monthly_ai_budget_usd'>(settings);
  const update = useUpdateAgentSettings();
  const toast = useAgentToast();
  const status = useAiStatus();
  const budget = useAiBudget();
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
    <Section
      title="AI and budget"
      description="The agent finds problems with plain database rules. AI only writes things up: summaries, message drafts and chat answers. It is off until you switch it on."
      footer={<SaveBar dirty={d.dirty} saving={update.isPending} onSave={save} onCancel={d.reset} readOnly={readOnly} />}
    >
      <div className="flex flex-wrap items-center gap-3" data-testid="ai-status">
        <span className="text-sm font-medium">Claude key</span>
        {status.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : status.data ? (
          status.data.key_configured
            ? <Badge variant="outline" className="gap-1 text-emerald-600"><CheckCircle2 className="h-3 w-3" /> Set</Badge>
            : <Badge variant="outline" className="gap-1 text-amber-600"><XCircle className="h-3 w-3" /> Not set</Badge>
        ) : <Badge variant="outline">Unknown: the agent-ai function did not answer</Badge>}
        <span className="text-xs text-muted-foreground">The key lives only in the Supabase secret ANTHROPIC_API_KEY. It is never shown or stored here.</span>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
        <div>
          <p className="text-sm font-medium">AI features</p>
          <p className="text-xs text-muted-foreground">Summaries, message drafts and chat. Turn on after the rules have run in Observe mode and you trust what they find.</p>
        </div>
        <Switch checked={d.value('ai_enabled')} onCheckedChange={(v) => d.set('ai_enabled', v)} disabled={readOnly} aria-label="AI features" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Daily budget (USD)" htmlFor="ai-daily" hint="At 80% background AI work pauses. At 100% all AI stops.">
          <Input id="ai-daily" type="number" min={0} step="0.5" value={d.value('daily_ai_budget_usd')} disabled={readOnly}
            onChange={(e) => d.set('daily_ai_budget_usd', Number(e.target.value))} />
        </Field>
        <Field label="Monthly budget (USD)" htmlFor="ai-monthly">
          <Input id="ai-monthly" type="number" min={0} step="1" value={d.value('monthly_ai_budget_usd')} disabled={readOnly}
            onChange={(e) => d.set('monthly_ai_budget_usd', Number(e.target.value))} />
        </Field>
      </div>

      {budget.data && (
        <div className="space-y-3" data-testid="ai-meter">
          <Meter label="Today" spent={budget.data.spent_today_usd} budget={budget.data.daily_budget_usd} />
          <Meter label="This month" spent={budget.data.spent_month_usd} budget={budget.data.monthly_budget_usd} />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Fast model" htmlFor="ai-fast" hint="Used for short, frequent jobs.">
          <Input id="ai-fast" value={fast} disabled={readOnly} onChange={(e) => d.set('model_fast', e.target.value.trim())} />
        </Field>
        <Field label="Smart model" htmlFor="ai-smart" hint="Used for chat and summaries.">
          <Input id="ai-smart" value={smart} disabled={readOnly} onChange={(e) => d.set('model_smart', e.target.value.trim())} />
        </Field>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Price per million tokens (USD)</p>
        <p className="text-xs text-muted-foreground">Used to estimate cost. These are estimates; correct them if Anthropic's prices change.</p>
        {[...new Set([fast, smart])].filter(Boolean).map((model) => (
          <div key={model} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-5">
            <div className="col-span-2 truncate text-sm sm:col-span-1" title={model}>{model}</div>
            {PRICE_FIELDS.map(({ key, label }) => (
              <Field key={key} label={label}>
                <Input type="number" min={0} step="0.01" value={prices[model]?.[key] ?? ''} disabled={readOnly} aria-label={`${model} ${label}`}
                  onChange={(e) => setPrice(model, key, e.target.value)} />
              </Field>
            ))}
            {prices[model]?.input === undefined && <p className="col-span-2 text-xs text-amber-600 sm:col-span-5">No price set for this model, so its cost is logged as $0.00.</p>}
          </div>
        ))}
      </div>

      {!readOnly && (
        <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-medium">Test the connection</p>
          <div className="flex flex-wrap items-center gap-2">
            {(['fast', 'smart'] as const).map((alias) => (
              <Button key={alias} size="sm" variant="outline" onClick={() => runTest(alias)} disabled={test.isPending} data-testid={`ai-test-${alias}`}>
                {test.isPending && test.variables === alias && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />} Test {alias} model
              </Button>
            ))}
            <span className="text-xs text-muted-foreground">Sends one tiny message. Costs a fraction of a cent.</span>
          </div>
          {lastTest && (
            <p className={lastTest.result.ok ? 'text-sm text-emerald-600' : 'text-sm text-destructive'} role="status" data-testid="ai-test-result">
              {lastTest.result.ok
                ? `Connected. ${lastTest.result.model} answered "${lastTest.result.text}" (${usd(lastTest.result.cost_usd, 5)}).`
                : `${TEST_MESSAGE[lastTest.result.reason ?? 'error'] ?? 'The test failed.'}${lastTest.result.error ? ` (${lastTest.result.error})` : ''}`}
            </p>
          )}
        </div>
      )}

      {(usage.data?.length ?? 0) > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">Recent AI calls ({usage.data!.length})</summary>
          <ul className="mt-2 space-y-1">
            {usage.data!.map((u) => (
              <li key={u.id} className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                <span>{new Date(u.created_at).toLocaleString()}</span><span>{u.feature}</span><span>{u.model}</span>
                <span>{u.input_tokens} in / {u.output_tokens} out</span><span>{usd(u.cost_usd, 5)}</span>{!u.ok && <span className="text-destructive">failed</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Section>
  );
}
