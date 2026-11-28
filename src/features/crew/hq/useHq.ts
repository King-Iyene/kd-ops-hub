// One composed view of everything that waits on the owner, shared by Today, Decisions, the command bar and the quick inbox, so they can never disagree.
import { useMemo } from 'react';
import type { CrewAgent, CrewMessage } from '../crewDb';
import { useCrewAgents, useCrewInbox, useCrewOrders, useCrewProposals } from '../useCrew';
import { buildDecisions, isQuestion, questionState, type DecisionItem, type QuestionState } from './logic';
import { useDismissed, useSnoozed } from './store';

export interface HqData {
  loading: boolean;
  error: string | null;
  agents: CrewAgent[];
  byId: Map<string, CrewAgent>;
  messages: CrewMessage[];
  items: DecisionItem[];
  snoozedCount: number;
  proposalsWaiting: number;
  questionsOpen: number;
  ordersChallenged: number;
  /** Unread notes that are not questions: alerts, briefs, reports, reminders, challenges. They are read-and-forget, not decisions. */
  updates: CrewMessage[];
  /** Questions the owner has dealt with (answered or dismissed), newest first. */
  closedQuestions: { message: CrewMessage; state: QuestionState }[];
  stateOf: (q: CrewMessage) => QuestionState;
}

export function useHqData(includeSnoozed = false): HqData {
  const agentsQ = useCrewAgents();
  const inbox = useCrewInbox(true);
  const waiting = useCrewProposals('waiting');
  const orders = useCrewOrders();
  const { dismissed } = useDismissed();
  const { snoozed } = useSnoozed();

  const agents = useMemo(() => (agentsQ.data ?? []).filter((a) => a.active), [agentsQ.data]);
  const byId = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const messages = useMemo(() => inbox.data ?? [], [inbox.data]);

  return useMemo(() => {
    const built = buildDecisions({ proposals: waiting.data ?? [], messages, orders: orders.data ?? [], dismissed, snoozed, now: Date.now(), includeSnoozed });
    const stateOf = (q: CrewMessage) => questionState(q, messages, dismissed);
    const qs = messages.filter(isQuestion);
    const closed = qs.map((m) => ({ message: m, state: stateOf(m) })).filter((x) => x.state.state !== 'open').sort((a, b) => b.message.created_at.localeCompare(a.message.created_at)).slice(0, 30);
    return {
      loading: agentsQ.isLoading || inbox.isLoading || waiting.isLoading,
      error: (agentsQ.error ?? inbox.error ?? waiting.error ?? orders.error)?.message ?? null,
      agents, byId, messages, items: built.items, snoozedCount: built.snoozedCount,
      proposalsWaiting: (waiting.data ?? []).length,
      questionsOpen: qs.filter((m) => stateOf(m).state === 'open').length,
      ordersChallenged: (orders.data ?? []).filter((o) => o.status === 'challenged').length,
      updates: messages.filter((m) => m.to_owner && m.from_agent && !m.read_at && m.kind !== 'question'),
      closedQuestions: closed, stateOf,
    };
  }, [agents, byId, messages, waiting.data, waiting.isLoading, waiting.error, orders.data, orders.error, dismissed, snoozed, includeSnoozed, agentsQ.isLoading, agentsQ.error, inbox.isLoading, inbox.error]);
}

/** What the badge on the Command Center button counts: decisions, open questions and unread updates. A question read by the old inbox still counts. */
export function useHqAttention(enabled: boolean) {
  const inbox = useCrewInbox(enabled);
  const waiting = useCrewProposals('waiting');
  const { dismissed } = useDismissed();
  return useMemo(() => {
    const msgs = inbox.data ?? [];
    const open = msgs.filter((m) => isQuestion(m) && questionState(m, msgs, dismissed).state === 'open').length;
    const updates = msgs.filter((m) => m.to_owner && m.from_agent && !m.read_at && m.kind !== 'question').length;
    const decisions = (waiting.data ?? []).length;
    return { questions: open, updates, decisions, total: open + updates + decisions };
  }, [inbox.data, waiting.data, dismissed]);
}
