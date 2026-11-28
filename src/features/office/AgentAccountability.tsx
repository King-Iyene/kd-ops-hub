import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useCrewMistakes, useLogMistake, useRetireAgent } from '@/features/crew/useCrew';
import { ago } from '@/features/crew/helpers';

/**
 * Mistakes against one executive (the last 30 days count towards letting them go), a way to log one, and letting them go. All the owner's.
 * Their manager can propose the same thing (it then waits in the Approvals queue); this is the direct way.
 */
export function AgentAccountability({ agentId, name, onGone }: { agentId: string; name: string; onGone: () => void }) {
  const { toast } = useToast();
  const mistakes = useCrewMistakes(agentId);
  const log = useLogMistake();
  const retire = useRetireAgent();
  const [note, setNote] = useState('');
  const [letGo, setLetGo] = useState(false);
  const [reason, setReason] = useState('');
  const first = name.split(' ')[0];
  const recent = (mistakes.data ?? []).filter((m) => Date.now() - new Date(m.created_at).getTime() < 30 * 86_400_000);
  return (
    <div className="space-y-3 border-t pt-3 text-sm">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Mistakes (last 30 days)</p>
        <span className={recent.length >= 3 ? 'text-right font-semibold text-red-500' : 'text-muted-foreground'}>
          {recent.length}{recent.length >= 3 ? ' (their manager may propose letting them go)' : ''}
        </span>
      </div>
      {(mistakes.data ?? []).slice(0, 3).map((m) => (
        <p key={m.id} className="text-[13px]"><span className="text-muted-foreground">{ago(m.created_at)} · {m.kind.replace(/_/g, ' ')}:</span> {m.note}</p>
      ))}
      <div className="flex gap-2">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={1} placeholder={'Log a mistake by ' + first + '…'} className="min-h-9 text-[13px]" />
        <Button
          size="sm" variant="outline" disabled={note.trim().length < 3 || log.isPending}
          onClick={() => log.mutate({ agentId, kind: 'other', note }, {
            onSuccess: () => { setNote(''); toast({ title: 'Logged', description: first + ' is told.' }); },
            onError: (e) => toast({ title: 'Not logged', description: e.message, variant: 'destructive' }),
          })}
        >Log</Button>
      </div>
      {!letGo ? (
        <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600" onClick={() => setLetGo(true)}>Let {first} go…</Button>
      ) : (
        <div className="space-y-2 rounded-md border border-red-500/40 p-3">
          <p className="text-[13px]">
            This switches {first} off now: their access is cancelled, their waiting proposals are withdrawn and the people who report to them move to their manager.
            Their history stays. Their manager can then propose a replacement, and you approve it.
          </p>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Why (kept in the record)" className="text-[13px]" />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setLetGo(false)}>Cancel</Button>
            <Button
              size="sm" variant="destructive" disabled={retire.isPending}
              onClick={() => retire.mutate({ agentId, reason }, {
                onSuccess: () => { toast({ title: first + ' has left', description: 'Their manager can now propose a replacement.' }); onGone(); },
                onError: (e) => toast({ title: 'Not done', description: e.message, variant: 'destructive' }),
              })}
            >Let {first} go</Button>
          </div>
        </div>
      )}
    </div>
  );
}
