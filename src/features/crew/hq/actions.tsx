// Everything the owner can do to a decision or an agent, in one place, with the same words and toasts on every screen. It only wraps the existing
// mutations (crew_decide, crew_say, crew_mark_read, crew_resolve_order); nothing new is written to the database.
import { useCallback, useSyncExternalStore } from 'react';
import { ToastAction } from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';
import type { CrewAgent, CrewMessage, CrewOrder, CrewProposal } from '../crewDb';
import { useDecideProposal, useGiveOrder, useMarkRead, useResolveOrder, useSay } from '../useCrew';
import { useDismissed, useSnoozed } from './store';

// ── "Sent: Hale is on it": what the owner just sent, kept in memory so the screens can show whether the agent has picked it up ──────────────────
export interface Receipt { id: string; agentId: string; at: string; text: string; about?: string }
let receipts: Receipt[] = [];
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const addReceipt = (r: Receipt) => { receipts = [r, ...receipts].slice(0, 12); emit(); };
export const clearReceipt = (id: string) => { receipts = receipts.filter((r) => r.id !== id); emit(); };
/** Test hook. */
export const resetReceipts = () => { receipts = []; emit(); };
export function useReceipts(): Receipt[] {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => receipts, () => receipts);
}

export const firstName = (a?: Pick<CrewAgent, 'name'>) => a?.name.split(' ')[0] ?? 'They';
const err = (e: Error) => e.message;

export function useHqActions(agents: CrewAgent[]) {
  const { toast } = useToast();
  const decide = useDecideProposal();
  const say = useSay();
  const read = useMarkRead();
  const resolve = useResolveOrder();
  const give = useGiveOrder();
  const { dismiss, restore } = useDismissed();
  const { snooze, wake } = useSnoozed();
  const nameOf = useCallback((id: string | null) => firstName(agents.find((a) => a.id === id)), [agents]);

  const send = useCallback((agentId: string, body: string, about?: string, onDone?: () => void) => {
    say.mutate({ agentId, body }, {
      onSuccess: (id) => {
        addReceipt({ id: String(id ?? agentId + Date.now()), agentId, at: new Date().toISOString(), text: body, about });
        toast({ title: `Sent: ${nameOf(agentId)} is on it`, description: 'They are woken to read it. The status shows below while it is picked up.' });
        onDone?.();
      },
      onError: (e) => toast({ title: 'Not sent', description: err(e), variant: 'destructive' }),
    });
  }, [say, toast, nameOf]);

  const approve = useCallback((p: CrewProposal) => {
    const hire = p.action === 'agent.hire';
    decide.mutate({ id: p.id, decision: 'approve' }, {
      onSuccess: (r) => (r?.error || r?.status === 'failed'
        ? toast({ title: 'Approved, but it did not apply', description: r.error ?? 'The database refused it. Nothing was changed.', variant: 'destructive' })
        : toast({ title: hire ? 'Hired' : 'Approved', description: p.action.startsWith('record.') || p.action.startsWith('app.') ? 'The change is applied.' : 'It is done.' })),
      onError: (e) => toast({ title: 'Could not approve', description: err(e), variant: 'destructive' }),
    });
  }, [decide, toast]);

  const reject = useCallback((p: CrewProposal, note: string) => {
    decide.mutate({ id: p.id, decision: 'reject', note }, {
      onSuccess: () => toast({ title: p.action === 'agent.hire' ? 'Passed' : 'Not needed', description: note.trim() ? 'They will learn from your reason.' : 'No reason given: they will ask before proposing it again.' }),
      onError: (e) => toast({ title: 'Could not reject', description: err(e), variant: 'destructive' }),
    });
  }, [decide, toast]);

  const challenge = useCallback((p: CrewProposal, text: string, onDone?: () => void) => {
    send(p.agent_id, `About your proposal "${p.summary.slice(0, 80)}": ${text.trim()}`, 'challenge', onDone);
  }, [send]);

  const answer = useCallback((m: CrewMessage, text: string, onDone?: () => void) => {
    if (!m.from_agent) return;
    send(m.from_agent, text.trim(), 'answer', () => {
      read.mutate([m.id]);   // clears the unread mark; the question itself is "answered" because the owner wrote to that agent after it
      onDone?.();
    });
  }, [send, read]);

  const dismissQuestion = useCallback((m: CrewMessage) => {
    dismiss(m.id);
    read.mutate([m.id]);
    toast({ title: 'Marked not needed', description: 'It will not come back.', action: <ToastAction altText="Undo: bring the question back" onClick={() => restore(m.id)}>Undo</ToastAction> });
  }, [dismiss, restore, read, toast]);

  const snoozeItem = useCallback((id: string, until: number, label: string) => {
    snooze(id, until);
    toast({ title: `Snoozed until ${label}`, action: <ToastAction altText="Undo: bring it back now" onClick={() => wake(id)}>Undo</ToastAction> });
  }, [snooze, wake, toast]);

  const markUpdateRead = useCallback((ids: string[]) => read.mutate(ids, { onError: (e) => toast({ title: 'Could not mark it', description: err(e), variant: 'destructive' }) }), [read, toast]);

  const resolveOrder = useCallback((o: CrewOrder, resolution: 'veto' | 'insist' | 'accept_challenge', note: string) => {
    const msg = { accept_challenge: 'You agreed with them: the order is withdrawn', veto: 'Vetoed: the order is cancelled', insist: 'You insisted: they will comply and note their objection' }[resolution];
    resolve.mutate({ id: o.id, resolution, note }, { onSuccess: () => toast({ title: msg }), onError: (e) => toast({ title: 'Not saved', description: err(e), variant: 'destructive' }) });
  }, [resolve, toast]);

  const giveOrder = useCallback((agentId: string, text: string, onDone?: () => void) => {
    give.mutate({ agentId, text }, { onSuccess: () => { toast({ title: 'Order given', description: `${nameOf(agentId)} must answer it: accept, or challenge it with evidence.` }); onDone?.(); }, onError: (e) => toast({ title: 'Not sent', description: err(e), variant: 'destructive' }) });
  }, [give, toast, nameOf]);

  return {
    busy: decide.isPending || say.isPending || read.isPending || resolve.isPending || give.isPending,
    sending: say.isPending, deciding: decide.isPending,
    send, approve, reject, challenge, answer, dismissQuestion, snoozeItem, markUpdateRead, resolveOrder, giveOrder, nameOf,
  };
}
export type HqActions = ReturnType<typeof useHqActions>;
