import { useQueryClient } from '@tanstack/react-query';
import { Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useSupabaseMutation, useSupabaseQuery } from '@/queries/useSupabaseQuery';
import { cdb } from '../crewDb';

interface PausedRow { id: string; paused: boolean }

/** Which agents are paused (one small query, shared by every toggle on the page). */
export function usePausedAgents() {
  return useSupabaseQuery<PausedRow[]>(['crew', 'paused'], () => cdb.from('crew_agents').select('id, paused') as never, { staleTime: 10_000, refetchInterval: 30_000 });
}

/**
 * Pause or resume one agent. A paused agent is never woken (the database refuses to queue it), so it burns no tokens. Messages to it wait and
 * it reads them when you resume it. Only the owner can do this (the database checks it too).
 */
export function PauseToggle({ agentId, name }: { agentId: string; name: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const paused = usePausedAgents();
  const first = name.split(' ')[0];
  const isPaused = (paused.data ?? []).find((r) => r.id === agentId)?.paused ?? false;
  const set = useSupabaseMutation<{ paused: boolean }, boolean>(
    (p) => cdb.rpc('crew_set_paused', { p_agent: agentId, p_paused: p }) as never,
    { onSuccess: () => { void qc.invalidateQueries({ queryKey: ['crew'] }); } },
  );
  const flip = () => set.mutate(!isPaused, {
    onSuccess: (r) => toast({ title: r.paused ? `${first} is paused` : `${first} is back at work`, description: r.paused ? 'No wakes, no tokens. Messages to them wait until you resume.' : 'They will read their inbox now.' }),
    onError: (e) => toast({ title: 'Could not change that', description: e.message, variant: 'destructive' }),
  });
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-md border p-3 ${isPaused ? 'border-amber-500/50 bg-amber-500/10' : 'bg-muted/40'}`}>
      <div className="min-w-0 flex-1 text-xs">
        <p className="text-sm font-medium">{isPaused ? `${first} is paused` : `${first} is working`}</p>
        <p className="text-muted-foreground">{isPaused ? 'Never woken, so no tokens are used. Messages to them wait until you resume.' : 'Pause them when you do not need them for a while: no wakes, no tokens.'}</p>
      </div>
      <Button size="sm" variant={isPaused ? 'default' : 'outline'} onClick={flip} disabled={set.isPending}>
        {isPaused ? <><Play className="mr-1 h-4 w-4" />Resume {first}</> : <><Pause className="mr-1 h-4 w-4" />Pause {first}</>}
      </Button>
    </div>
  );
}
