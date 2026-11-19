import { AlertTriangle, KeyRound, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAiBudget, useAiStatus } from '@/queries/useOpsAgent';
import { usd } from './agentDb';

/** Plain-language notices at the top of the module: key missing, budget close, budget spent. */
export function AgentBanners({ canConfigure, onOpenSettings }: { canConfigure: boolean; onOpenSettings: () => void }) {
  const status = useAiStatus();
  const budget = useAiBudget();
  const notices: { id: string; tone: 'warn' | 'bad'; icon: typeof KeyRound; text: string; action?: boolean }[] = [];

  if (status.data && !status.data.key_configured) {
    notices.push({
      id: 'key', tone: 'warn', icon: KeyRound, action: canConfigure,
      text: canConfigure
        ? 'The Claude key is not set. Rules still run; summaries, chat and message drafts stay off until a Super Admin adds the key as the ANTHROPIC_API_KEY secret.'
        : 'AI features are off because the Claude key is not set. Rules still run.',
    });
  }
  const b = budget.data;
  if (b?.level === 'off') {
    notices.push({ id: 'off', tone: 'bad', icon: Wallet, text: `The AI budget is spent (${usd(b.spent_today_usd)} today, ${usd(b.spent_month_usd)} this month). All AI is paused until the day or month rolls over, or a Super Admin raises the budget. Rules keep running.`, action: canConfigure });
  } else if (b?.level === 'warn') {
    notices.push({ id: 'warn', tone: 'warn', icon: AlertTriangle, text: `AI spend is past 80% of the budget (${usd(b.spent_today_usd)} of ${usd(b.daily_budget_usd)} today, ${usd(b.spent_month_usd)} of ${usd(b.monthly_budget_usd)} this month). Background AI work is paused; chat still works.`, action: canConfigure });
  }
  if (notices.length === 0) return null;

  return (
    <div className="space-y-2" data-testid="agent-banners">
      {notices.map(({ id, tone, icon: Icon, text, action }) => (
        <div
          key={id}
          role="status"
          className={
            tone === 'bad'
              ? 'flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm'
              : 'flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm'
          }
        >
          <Icon className={tone === 'bad' ? 'mt-0.5 h-4 w-4 shrink-0 text-destructive' : 'mt-0.5 h-4 w-4 shrink-0 text-amber-500'} />
          <p className="flex-1">{text}</p>
          {action && <Button size="sm" variant="outline" onClick={onOpenSettings}>Open settings</Button>}
        </div>
      ))}
    </div>
  );
}
