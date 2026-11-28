// DECISIONS: one decision at a time, large, with single-key shortcuts; or a compact list. Questions, proposals and challenged orders share the stack.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, History, Keyboard, List, Layers } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { ApprovalsTab } from '../components/ApprovalsTab';
import { ago } from '../helpers';
import { useHqActions } from './actions';
import { DecisionCard, DecisionRow } from './DecisionCard';
import { useHotkeys } from './hotkeys';
import { questionLabel, resolveSelection, stepIndex } from './logic';
import { PickupChip, SentReceipts } from './Receipts';
import { useHqData } from './useHq';
import { usePausedIds } from './pause';
import { Btn, Chip, EmptyState, ErrorState, Face, Kbd, LoadingRows } from './ui';

const SHORTCUTS: [string, string][] = [
  ['J', 'Next decision'], ['K', 'Previous decision'], ['A', 'Approve (high risk and deletes ask you to press it twice)'], ['R', 'Reject, with a reason; or "Not needed" on a question'],
  ['C', 'Challenge the agent; or write your answer to a question'], ['S', 'Snooze, then 1 for an hour or 2 for tomorrow 8am'], ['L', 'Switch between stack and list'], ['?', 'This help'], ['Esc', 'Close a box'],
];

function Help({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Keyboard shortcuts</DialogTitle><DialogDescription>Single keys work when you are not typing in a box.</DialogDescription></DialogHeader>
        <dl className="space-y-2">{SHORTCUTS.map(([k, d]) => <div key={k} className="flex items-start gap-3"><dt className="w-10 shrink-0"><Kbd>{k}</Kbd></dt><dd className="text-sm">{d}</dd></div>)}</dl>
      </DialogContent>
    </Dialog>
  );
}

export function DecisionsView({ focusId, initialSub }: { focusId?: string | null; initialSub?: 'now' | 'history' }) {
  const [includeSnoozed, setIncludeSnoozed] = useState(false);
  const data = useHqData(includeSnoozed);
  const actions = useHqActions(data.agents);
  const paused = usePausedIds();
  const [mode, setMode] = useState<'stack' | 'list'>('stack');
  const [sub, setSub] = useState<'now' | 'history'>(initialSub ?? 'now');
  const [helpOpen, setHelpOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(focusId ?? null);
  const lastIndex = useRef(0);

  useEffect(() => { if (focusId) { setSelected(focusId); setMode('stack'); setSub('now'); } }, [focusId]);

  const ids = useMemo(() => data.items.map((i) => i.id), [data.items]);
  const sel = resolveSelection(ids, selected, lastIndex.current);
  useEffect(() => { if (sel.index >= 0) lastIndex.current = sel.index; }, [sel.index]);
  useEffect(() => { if (sel.id !== selected) setSelected(sel.id); }, [sel.id, selected]);

  const go = (dir: 1 | -1) => { const i = stepIndex(sel.index, dir, ids.length); if (i >= 0) setSelected(ids[i]); };
  const live = sub === 'now' && !helpOpen;
  useHotkeys({ j: () => go(1), k: () => go(-1), l: () => setMode((m) => (m === 'stack' ? 'list' : 'stack')), '?': () => setHelpOpen(true) }, live);

  const item = sel.index >= 0 ? data.items[sel.index] : undefined;
  const total = data.items.length;
  const handledQuestions = data.closedQuestions.slice(0, 6);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl bg-muted p-1" role="tablist" aria-label="Decisions">
          {([['now', 'Waiting for you'], ['history', 'History']] as const).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={sub === k} onClick={() => setSub(k)} className={cn('hq-focus inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold transition', sub === k ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              {k === 'history' ? <History className="h-4 w-4" aria-hidden /> : null}{label}{k === 'now' && total ? <span className="hq-num rounded-full bg-[hsl(var(--hq-signal)/0.14)] px-1.5 text-xs text-[hsl(var(--hq-signal-ink))]">{total}</span> : null}
            </button>
          ))}
        </div>
        {sub === 'now' ? (
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-xl bg-muted p-1" role="group" aria-label="Layout">
              <button type="button" aria-pressed={mode === 'stack'} onClick={() => setMode('stack')} className={cn('hq-focus inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-bold', mode === 'stack' ? 'bg-card shadow-sm' : 'text-muted-foreground')}><Layers className="h-4 w-4" aria-hidden />Stack</button>
              <button type="button" aria-pressed={mode === 'list'} onClick={() => setMode('list')} className={cn('hq-focus inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-bold', mode === 'list' ? 'bg-card shadow-sm' : 'text-muted-foreground')}><List className="h-4 w-4" aria-hidden />List</button>
            </div>
            <Btn tone="ghost" onClick={() => setHelpOpen(true)} aria-label="Keyboard shortcuts"><Keyboard className="h-4 w-4" /><span className="hidden sm:inline">Shortcuts</span><Kbd>?</Kbd></Btn>
          </div>
        ) : null}
      </div>

      {sub === 'history' ? <div className="rounded-2xl border border-border bg-card p-4"><ApprovalsTab /></div> : (
        <>
          {data.error ? <ErrorState message={data.error} /> : null}
          {data.loading ? <LoadingRows label="Loading decisions" /> : null}
          {!data.loading && !data.error && total === 0 ? (
            <EmptyState title="Nothing waiting for you">When an agent needs a decision or an answer it lands here, most urgent first.{data.snoozedCount ? ` ${data.snoozedCount} snoozed.` : ''}</EmptyState>
          ) : null}

          {total > 0 && mode === 'stack' && item ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Btn tone="soft" onClick={() => go(-1)} aria-label="Previous decision" disabled={total < 2}><ChevronLeft className="h-4 w-4" /><span className="hidden md:inline-flex"><Kbd>K</Kbd></span></Btn>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center justify-between text-xs"><span className="hq-num font-bold" aria-live="polite">Decision {sel.index + 1} of {total}</span><span className="text-muted-foreground">{data.snoozedCount ? `${data.snoozedCount} snoozed` : ''}</span></div>
                  <div role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={sel.index + 1} aria-label="Position in the stack" className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-[hsl(var(--hq-signal))] transition-[width] duration-300" style={{ width: `${((sel.index + 1) / total) * 100}%` }} />
                  </div>
                </div>
                <Btn tone="soft" onClick={() => go(1)} aria-label="Next decision" disabled={total < 2}><span className="hidden md:inline-flex"><Kbd>J</Kbd></span><ChevronRight className="h-4 w-4" /></Btn>
              </div>
              <DecisionCard key={item.id} item={item} byId={data.byId} actions={actions} paused={paused} stateOf={data.stateOf} hotkeys={live} />
              {total > 1 ? <p className="text-center text-xs text-muted-foreground">Up next: {nextTitle(data.items[stepIndex(sel.index, 1, total)])}</p> : null}
            </div>
          ) : null}

          {total > 0 && mode === 'list' ? (
            <ul className="space-y-2" aria-label="Decisions waiting">
              {data.items.map((i) => <li key={i.id}><DecisionRow item={i} byId={data.byId} selected={i.id === sel.id} onSelect={() => { setSelected(i.id); setMode('stack'); }} /></li>)}
            </ul>
          ) : null}

          <SentReceipts byId={data.byId} paused={paused} />

          <div className="flex flex-wrap items-center gap-3">
            {data.snoozedCount > 0 || includeSnoozed ? <button type="button" onClick={() => setIncludeSnoozed(!includeSnoozed)} className="hq-focus rounded text-xs font-semibold text-[hsl(var(--hq-signal-ink))] hover:underline">{includeSnoozed ? 'Hide' : 'Show'} the {data.snoozedCount || ''} you snoozed</button> : null}
          </div>

          {handledQuestions.length ? (
            <details className="rounded-2xl border border-border bg-card p-4">
              <summary className="cursor-pointer text-sm font-bold">Questions you have dealt with ({data.closedQuestions.length})</summary>
              <ul className="mt-3 space-y-3">
                {handledQuestions.map(({ message: m, state }) => {
                  const a = m.from_agent ? data.byId.get(m.from_agent) : undefined;
                  return (
                    <li key={m.id} className="flex items-start gap-3">
                      {a ? <Face agent={a} size={28} paused={paused.has(a.id)} /> : null}
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm [overflow-wrap:anywhere]">{m.body}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Chip tone={state.state === 'answered' ? 'ok' : 'neutral'}>{questionLabel(state, ago)}</Chip>{a && state.state === 'answered' ? <PickupChip agent={a} sentAt={state.at} paused={paused.has(a.id)} /> : null}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </details>
          ) : null}
        </>
      )}
      <Help open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

function nextTitle(i: ReturnType<typeof useHqData>['items'][number] | undefined): string {
  if (!i) return '';
  const t = i.kind === 'proposal' ? i.proposal.summary : i.kind === 'question' ? i.message.body : i.order.text;
  return t.length > 90 ? t.slice(0, 90) + '…' : t;
}
