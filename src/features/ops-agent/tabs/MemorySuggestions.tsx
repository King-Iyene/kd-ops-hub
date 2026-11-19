import { Link } from 'react-router-dom';
import { Brain, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSetMemoryStatus } from '@/queries/useOpsAgentMemory';
import type { MemorySuggestion } from '../agentDb';
import { useAgentToast } from '../settings/useAgentToast';

export type Choice = 'yes' | 'no';

/** One "Remember this?" card. The row is already saved as waiting; a button press decides it. Nothing is written until then. */
function Suggestion({ s, choice, onChoice }: { s: MemorySuggestion; choice: Choice | undefined; onChoice: (id: string, c: Choice) => void }) {
  const set = useSetMemoryStatus();
  const toast = useAgentToast();
  const decide = (c: Choice) => set.mutate({ id: s.id, status: c === 'yes' ? 'active' : 'rejected' }, { onSuccess: () => onChoice(s.id, c), onError: toast.failed });
  return (
    <li className="rounded-xl border bg-card/70 p-3" data-testid="memory-suggestion" data-choice={choice}>
      <div className="flex items-start gap-2.5">
        <Brain className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Remember this?</p>
          <p className="text-sm">{s.content}</p>
          {s.detail && <p className="text-xs text-muted-foreground">{s.detail}</p>}
          {choice === 'yes' && (
            <p className="flex flex-wrap items-center gap-1.5 pt-0.5 text-xs text-success" role="status" data-testid="memory-saved">
              <Check className="h-3.5 w-3.5" aria-hidden="true" /> Saved to memory.{' '}
              <Link to="/agent/settings/memory" className="font-medium underline underline-offset-2">See it in Settings, Memory</Link>
            </p>
          )}
          {choice === 'no' && <p className="pt-0.5 text-xs text-muted-foreground" role="status" data-testid="memory-not-saved">Not saved.</p>}
          {!choice && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              <Button type="button" size="sm" className="h-8" disabled={set.isPending} onClick={() => decide('yes')} data-testid="memory-yes">Yes, remember</Button>
              <Button type="button" size="sm" variant="ghost" className="h-8" disabled={set.isPending} onClick={() => decide('no')} data-testid="memory-no">No</Button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

/** The "Remember this?" cards under an answer. The choices are kept by the chat, so a card still says "Saved to memory" or "Not saved". */
export function MemorySuggestions({ items, choices, onChoice }: { items: MemorySuggestion[]; choices: Record<string, Choice>; onChoice: (id: string, c: Choice) => void }) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-2" aria-label="Suggestions to remember" data-testid="memory-suggestions">
      {items.map((s) => <Suggestion key={s.id} s={s} choice={choices[s.id]} onChoice={onChoice} />)}
    </ul>
  );
}
