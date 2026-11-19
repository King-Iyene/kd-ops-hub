import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useUpdateAgentSettings } from '@/queries/useOpsAgent';
import type { AgentSettings } from '../agentDb';
import { useSettingsDraft } from './settingsDraft';
import { Field, SaveBar, Section } from './shared';
import { useAgentToast } from './useAgentToast';

const MAX_RULES = 20_000;

/** The Operating Rules text the AI is given as its standing instructions, plus who may see which flags. */
export function RulesCard({ settings, readOnly }: { settings: AgentSettings; readOnly: boolean }) {
  const d = useSettingsDraft<'operating_rules' | 'escalation_window_days' | 'hide_own_flags' | 'leadership_flags_super_admin_only' | 'readonly_query_enabled'>(settings);
  const update = useUpdateAgentSettings();
  const toast = useAgentToast();
  const rules = d.value('operating_rules');
  const win = d.value('escalation_window_days');
  const winBad = !Number.isInteger(win) || win < 1 || win > 90;
  const tooLong = rules.length > MAX_RULES;
  const save = () => update.mutate(d.patch, { onSuccess: () => { d.reset(); toast.saved('Operating Rules saved'); }, onError: toast.failed });

  const toggles: { key: 'hide_own_flags' | 'leadership_flags_super_admin_only' | 'readonly_query_enabled'; label: string; help: string }[] = [
    { key: 'hide_own_flags', label: 'Admins do not see flags about themselves or other Admins', help: 'Only a Super Admin sees flags about an Admin or Super Admin.' },
    { key: 'leadership_flags_super_admin_only', label: 'Flags about leadership are for Super Admins only', help: 'People in the Leadership group are hidden from Admins.' },
    { key: 'readonly_query_enabled', label: 'Chat may run read-only questions against the database', help: 'Used from Phase 4. Always read only, always limited to what the agent may see.' },
  ];

  return (
    <Section
      title="Operating Rules and privacy"
      description="This text is the agent's standing brief. It is added to every AI request, so keep it short and say it plainly."
      footer={<SaveBar dirty={d.dirty && !winBad && !tooLong} saving={update.isPending} onSave={save} onCancel={d.reset} readOnly={readOnly} />}
    >
      <Field label="Operating Rules" htmlFor="rules-text" hint={`${rules.length.toLocaleString()} of ${MAX_RULES.toLocaleString()} characters`}>
        <Textarea id="rules-text" rows={14} value={rules} disabled={readOnly} aria-invalid={tooLong} className="font-mono text-xs"
          onChange={(e) => d.set('operating_rules', e.target.value)} />
      </Field>
      <Field label="Escalation window (days)" htmlFor="rules-window" hint={winBad ? 'Use a whole number from 1 to 90.' : 'How long repeated misses are counted together before the next escalation step.'}>
        <Input id="rules-window" type="number" min={1} max={90} className="w-32" value={win} disabled={readOnly} aria-invalid={winBad}
          onChange={(e) => d.set('escalation_window_days', Number(e.target.value))} />
      </Field>
      <div className="space-y-2">
        {toggles.map((t) => (
          <div key={t.key} className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div><p className="text-sm font-medium">{t.label}</p><p className="text-xs text-muted-foreground">{t.help}</p></div>
            <Switch checked={d.value(t.key)} onCheckedChange={(v) => d.set(t.key, v)} disabled={readOnly} aria-label={t.label} />
          </div>
        ))}
      </div>
    </Section>
  );
}
