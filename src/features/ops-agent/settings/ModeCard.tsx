import { useUpdateAgentSettings } from '@/queries/useOpsAgent';
import { confirm } from '@/hooks/use-confirm';
import { MODE_META, type AgentMode, type AgentSettings } from '../agentDb';
import { Section } from './shared';
import { useAgentToast } from './useAgentToast';

/** How far the agent may go. Picking a mode saves at once (it is a deliberate click, never a render). */
export function ModeCard({ settings, readOnly }: { settings: AgentSettings; readOnly: boolean }) {
  const update = useUpdateAgentSettings();
  const toast = useAgentToast();

  const choose = async (mode: AgentMode) => {
    if (readOnly || mode === settings.mode || update.isPending) return;
    if (mode === 'enforce') {
      const ok = await confirm({
        title: 'Switch to Enforce mode?',
        description: 'The agent will draft reminders and escalations on schedule. A person still reads and approves every message before anything is sent. Records are never changed.',
        confirmLabel: 'Switch to Enforce',
      });
      if (!ok) return;
    }
    update.mutate({ mode }, { onSuccess: () => toast.saved(`Mode set to ${MODE_META[mode].label}`), onError: toast.failed });
  };

  return (
    <Section title="Mode" description="Start in Observe, watch what it flags for a few working days, then move up.">
      <div role="radiogroup" aria-label="Agent mode" className="grid gap-2 sm:grid-cols-3">
        {(Object.keys(MODE_META) as AgentMode[]).map((m) => {
          const on = settings.mode === m;
          return (
            <button
              key={m} type="button" role="radio" aria-checked={on} disabled={readOnly || update.isPending}
              onClick={() => choose(m)} data-testid={`mode-${m}`}
              className={`rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed ${on ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
            >
              <span className="text-sm font-medium">{MODE_META[m].label}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{MODE_META[m].help}</span>
            </button>
          );
        })}
      </div>
    </Section>
  );
}
