import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Check, ChevronLeft, ChevronRight, Mail } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { ago } from './helpers';
import { useCrewSettings } from './useCrew';
import { useHqActions } from './hq/actions';
import { DecisionCard } from './hq/DecisionCard';
import { resolveSelection, stepIndex } from './hq/logic';
import { usePausedIds } from './hq/pause';
import { SentReceipts } from './hq/Receipts';
import { Btn, Chip, EmptyState, ErrorState, Face, Kbd, LoadingRows, Prose } from './hq/ui';
import { useHqAttention, useHqData } from './hq/useHq';
import './hq/hq.css';

export const OPEN_MAILBOX = 'crew-open-mailbox';

/** Opens the Command Center from anywhere (a pop-up, a link, the mailbox in the office), optionally on one message. */
export function openMailbox(messageId?: string) { window.dispatchEvent(new CustomEvent(OPEN_MAILBOX, { detail: { id: messageId ?? null } })); }

/**
 * The quick inbox: the same decision stack as Crew HQ (same cards, same wording), one decision at a time, plus the unread updates. For the full
 * picture (work board, agents, meetings, memory) it opens Crew HQ.
 */
function QuickInbox({ open, onOpenChange, focusId }: { open: boolean; onOpenChange: (o: boolean) => void; focusId: string | null }) {
  const navigate = useNavigate();
  const data = useHqData();
  const actions = useHqActions(data.agents);
  const paused = usePausedIds();
  const [selected, setSelected] = useState<string | null>(null);

  // a message opened from a pop-up is the one shown first
  useEffect(() => { if (open && focusId) setSelected(focusId); }, [open, focusId]);

  const ids = useMemo(() => data.items.map((i) => i.id), [data.items]);
  const sel = resolveSelection(ids, selected, 0);
  useEffect(() => { if (sel.id !== selected) setSelected(sel.id); }, [sel.id, selected]);
  const item = sel.index >= 0 ? data.items[sel.index] : undefined;
  const total = data.items.length;
  const step = (dir: 1 | -1) => { const i = stepIndex(sel.index, dir, total); if (i >= 0) setSelected(ids[i]); };
  const busy = data.agents.filter((a) => a.status === 'working' || a.status === 'thinking').length;
  const openHq = (qs = '') => { onOpenChange(false); navigate('/crew' + qs); };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="crew-hq flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="space-y-3 border-b border-border p-4 text-left">
          <div className="flex items-start justify-between gap-3 pr-8">
            <div className="min-w-0"><SheetTitle>Command Center</SheetTitle><SheetDescription>Everything your executives need from you.</SheetDescription></div>
            <Btn tone="go" onClick={() => openHq()}>Open Crew HQ<ArrowUpRight className="h-4 w-4" /></Btn>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {([['Decisions', data.proposalsWaiting + data.ordersChallenged], ['Questions', data.questionsOpen], ['Working now', busy]] as const).map(([l, v]) => (
              <div key={l} className="rounded-xl bg-muted/70 p-2"><p className={cn('hq-num text-xl font-bold leading-tight', v ? 'text-[hsl(var(--hq-signal-ink))]' : 'text-muted-foreground')}>{v}</p><p className="hq-eyebrow !text-[10px]">{l}</p></div>
            ))}
          </div>
          <ul className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" aria-label="The team">
            {data.agents.map((a) => (
              <li key={a.id} className="shrink-0"><button type="button" title={`${a.name}: open profile`} aria-label={`Open ${a.name}'s profile in Crew HQ`} onClick={() => openHq(`?view=agents&agent=${a.id}`)} className="hq-focus rounded-full"><Face agent={a} size={34} paused={paused.has(a.id)} /></button></li>
            ))}
          </ul>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <SentReceipts byId={data.byId} paused={paused} limit={2} />
          {data.error ? <ErrorState message={data.error} /> : null}
          {data.loading ? <LoadingRows rows={2} label="Loading your inbox" /> : null}
          {!data.loading && !data.error && total === 0 ? <EmptyState title="All clear">When an agent needs a decision, an answer or your eyes, it lands here with the full story and buttons.</EmptyState> : null}

          {item ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Btn tone="soft" aria-label="Previous decision" disabled={total < 2} onClick={() => step(-1)}><ChevronLeft className="h-4 w-4" /></Btn>
                <div className="min-w-0 flex-1"><p className="hq-num text-xs font-bold" aria-live="polite">Decision {sel.index + 1} of {total}</p>
                  <div role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={sel.index + 1} aria-label="Position in the stack" className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[hsl(var(--hq-signal))] transition-[width] duration-300" style={{ width: `${((sel.index + 1) / total) * 100}%` }} /></div>
                </div>
                <Btn tone="soft" aria-label="Next decision" disabled={total < 2} onClick={() => step(1)}><ChevronRight className="h-4 w-4" /></Btn>
              </div>
              <DecisionCard key={item.id} item={item} byId={data.byId} actions={actions} paused={paused} stateOf={data.stateOf} />
              <p className="hidden text-center text-xs text-muted-foreground md:block">Single-key shortcuts (<Kbd>J</Kbd> <Kbd>K</Kbd> <Kbd>A</Kbd> <Kbd>R</Kbd>) work in Crew HQ.</p>
            </div>
          ) : null}

          {data.updates.length ? (
            <section className="space-y-2">
              <div className="flex items-center justify-between"><p className="hq-eyebrow">Updates ({data.updates.length})</p>{data.updates.length > 1 ? <Btn tone="soft" className="min-h-8 px-3 py-1 text-xs" onClick={() => actions.markUpdateRead(data.updates.map((m) => m.id))}>Got it on all</Btn> : null}</div>
              <ul className="space-y-2">
                {data.updates.slice(0, 6).map((m) => {
                  const a = m.from_agent ? data.byId.get(m.from_agent) : undefined;
                  return (
                    <li key={m.id} className={cn('flex items-start gap-3 rounded-2xl border bg-card p-3', m.id === focusId ? 'border-[hsl(var(--hq-signal))]' : 'border-border')}>
                      {a ? <Face agent={a} size={30} paused={paused.has(a.id)} /> : null}
                      <div className="min-w-0 flex-1"><p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span className="font-bold text-foreground">{a?.name.split(' ')[0]}</span><Chip tone={m.kind === 'alert' || m.kind === 'challenge' ? 'risk' : 'neutral'}>{m.kind}</Chip>{ago(m.created_at)}</p><Prose text={m.body} lines={3} className="mt-1" /></div>
                      <Btn tone="soft" aria-label="Got it" onClick={() => actions.markUpdateRead([m.id])}><Check className="h-4 w-4" /></Btn>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * The owner's Command Center: the envelope in the top bar and a standing button show how much waits for you; open it for the quick inbox. Nobody else
 * sees it: it is only shown to the owner, and the database returns nothing to anyone else. `headless` keeps the panel, the standing button and the F key
 * working where the top bar is hidden (the full-screen office in the desktop app).
 */
function Mailbox({ headless }: { headless: boolean }) {
  const attention = useHqAttention(true);
  const [open, setOpen] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const count = attention.total;

  useEffect(() => {
    const h = (e: Event) => { setFocusId((e as CustomEvent<{ id: string | null }>).detail?.id ?? null); setOpen(true); };
    window.addEventListener(OPEN_MAILBOX, h);
    return () => window.removeEventListener(OPEN_MAILBOX, h);
  }, []);

  return (
    <>
      {headless ? null : (
        <button type="button" onClick={() => { setFocusId(null); setOpen(true); }} aria-label={`Command Center, ${count} waiting`} title="Command Center: what your executives need from you"
          className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30 transition hover:bg-primary/25">
          <Mail className="h-5 w-5" />
          {count > 0 ? <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">{count > 99 ? '99+' : count}</span> : null}
        </button>
      )}
      {!open && headless ? (
        <button type="button" onClick={() => { setFocusId(null); setOpen(true); }} aria-label={`Open the Command Center, ${count} waiting`}
          className={cn('crew-hq fixed bottom-3 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold shadow-2xl transition hover:scale-105',
            count > 0 ? 'hq-signal-btn border-transparent ring-4 ring-[hsl(var(--hq-signal)/0.3)]' : 'border-border bg-card text-foreground')}>
          <Mail className="h-5 w-5" />
          {count > 0 ? <span>{count} waiting for you</span> : <span>Command Center</span>}
        </button>
      ) : null}
      <QuickInbox open={open} onOpenChange={(o) => { setOpen(o); if (!o) setFocusId(null); }} focusId={focusId} />
    </>
  );
}

/** Only the owner gets it: the button is not even rendered for anyone else, and it makes no requests for them. */
export function CrewMailbox({ headless = false }: { headless?: boolean } = {}) {
  const me = useAuthStore((s) => s.profile);
  if (me?.role !== 'super_admin') return null;
  return <OwnerGate meId={me.id} headless={headless} />;
}

function OwnerGate({ meId, headless }: { meId: string; headless: boolean }) {
  const settings = useCrewSettings();
  if (settings.data?.owner_profile_id !== meId) return null;
  return <Mailbox headless={headless} />;
}
