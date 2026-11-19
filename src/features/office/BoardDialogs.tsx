import { useState } from 'react';
import { ArrowLeft, ArrowRight, Plus, Trash2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { tally, type CardRow, type PollRow, type VoteRow } from './useBoards';

/** Live polls: ask the office a question, vote once (you can change your mind), watch the bars move. */
export function PollsDialog({ open, onClose, polls, votes, me, isAdmin, onCreate, onVote, onClosePoll }: {
  open: boolean;
  onClose: () => void;
  polls: PollRow[];
  votes: VoteRow[];
  me: string;
  isAdmin: boolean;
  onCreate: (question: string, options: string[]) => Promise<string | null>;
  onVote: (poll: string, option: number) => void;
  onClosePoll: (poll: string) => void;
}) {
  const [asking, setAsking] = useState(false);
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState(['', '']);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const clean = opts.map((o) => o.trim()).filter(Boolean);
    if (q.trim().length < 3) { setErr('Ask a question first.'); return; }
    if (clean.length < 2) { setErr('Give at least two choices.'); return; }
    setBusy(true);
    const e = await onCreate(q, clean);
    setBusy(false);
    if (e) { setErr(e); return; }
    setQ(''); setOpts(['', '']); setErr(null); setAsking(false);
  };
  const open_ = polls.filter((p) => !p.closed);
  const done = polls.filter((p) => p.closed).slice(0, 6);
  const card = (p: PollRow) => {
    const t = tally(p, votes, me);
    return (
      <div key={p.id} className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold">{p.question}</p>
          {!p.closed && (p.created_by === me || isAdmin) && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onClosePoll(p.id)}>End poll</Button>}
        </div>
        <div className="mt-3 space-y-2">
          {p.options.map((o, i) => {
            const pct = t.total ? Math.round((t.counts[i] / t.total) * 100) : 0;
            return (
              <button key={i} type="button" disabled={p.closed} onClick={() => onVote(p.id, i)} className={`relative block w-full overflow-hidden rounded-xl border px-3 py-2 text-left text-sm transition ${t.mine === i ? 'border-primary' : 'border-border'} ${p.closed ? 'cursor-default' : 'hover:border-primary'}`}>
                <span className="absolute inset-y-0 left-0 bg-primary/15 transition-all duration-500" style={{ width: pct + '%' }} />
                <span className="relative flex items-center justify-between gap-2"><span>{t.mine === i ? '✓ ' : ''}{o}</span><span className="text-xs font-semibold text-muted-foreground">{t.counts[i]} · {pct}%</span></span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">{t.total} {t.total === 1 ? 'vote' : 'votes'}{p.closed ? ' · ended' : t.mine === null ? ' · tap a choice to vote' : ' · tap another to change your vote'}</p>
      </div>
    );
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()} className="ko max-h-[88vh] max-w-xl overflow-y-auto">
        <DialogHeader><DialogTitle>📊 Poll board</DialogTitle></DialogHeader>
        {asking ? (
          <div className="space-y-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={200} placeholder="Your question" aria-label="Poll question" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
            {opts.map((o, i) => (
              <div key={i} className="flex gap-1">
                <input value={o} onChange={(e) => setOpts(opts.map((x, j) => (j === i ? e.target.value : x)))} maxLength={80} placeholder={`Choice ${i + 1}`} aria-label={`Choice ${i + 1}`} className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm" />
                {opts.length > 2 && <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setOpts(opts.filter((_, j) => j !== i))} aria-label="Remove choice"><X className="h-4 w-4" /></Button>}
              </div>
            ))}
            {opts.length < 6 && <Button size="sm" variant="ghost" onClick={() => setOpts([...opts, ''])}><Plus className="mr-1 h-3.5 w-3.5" />Add a choice</Button>}
            {err && <p className="text-xs text-destructive">{err}</p>}
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => { setAsking(false); setErr(null); }}>Cancel</Button><Button onClick={() => void submit()} disabled={busy}>{busy ? 'Posting…' : 'Post poll'}</Button></div>
          </div>
        ) : (
          <>
            <Button onClick={() => setAsking(true)}><Plus className="mr-1 h-4 w-4" />Ask the office</Button>
            {open_.length === 0 && done.length === 0 && <p className="text-sm text-muted-foreground">No polls yet. Ask the first question.</p>}
            <div className="space-y-3">{open_.map(card)}</div>
            {done.length > 0 && <><p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ended</p><div className="space-y-3">{done.map(card)}</div></>}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

const COLS = ['To do', 'Doing', 'Done'];
const COL_STYLE = ['bg-slate-500/10', 'bg-blue-500/10', 'bg-emerald-500/10'];

/** A shared task board: three columns, anyone in the office can add a card and move it along. */
export function TaskBoardDialog({ open, onClose, cards, me, isAdmin, onAdd, onMove, onDelete }: {
  open: boolean;
  onClose: () => void;
  cards: CardRow[];
  me: string;
  isAdmin: boolean;
  onAdd: (col: number, body: string) => Promise<string | null>;
  onMove: (card: string, col: number) => void;
  onDelete: (card: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const add = async () => {
    if (!draft.trim()) return;
    const e = await onAdd(0, draft);
    if (e) { setErr(e); return; }
    setDraft(''); setErr(null);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()} className="ko max-h-[88vh] max-w-4xl overflow-y-auto">
        <DialogHeader><DialogTitle>🗂️ Task board</DialogTitle></DialogHeader>
        <div className="flex gap-2">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void add(); }} maxLength={200} placeholder="Add a task and press Enter" aria-label="New task" className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm" />
          <Button onClick={() => void add()}><Plus className="mr-1 h-4 w-4" />Add</Button>
        </div>
        {err && <p className="text-xs text-destructive">{err}</p>}
        <div className="grid gap-3 md:grid-cols-3">
          {COLS.map((name, col) => (
            <div key={name} className={`rounded-2xl p-3 ${COL_STYLE[col]}`}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{name} · {cards.filter((c) => c.col === col).length}</p>
              <div className="space-y-2">
                {cards.filter((c) => c.col === col).map((c) => (
                  <div key={c.id} className="rounded-xl border border-border bg-card p-2.5 text-sm shadow-sm">
                    <p className="break-words">{c.body}</p>
                    <div className="mt-1.5 flex items-center justify-between">
                      <div className="flex gap-1">
                        {col > 0 && <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onMove(c.id, col - 1)} aria-label={`Move to ${COLS[col - 1]}`}><ArrowLeft className="h-3.5 w-3.5" /></Button>}
                        {col < 2 && <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onMove(c.id, col + 1)} aria-label={`Move to ${COLS[col + 1]}`}><ArrowRight className="h-3.5 w-3.5" /></Button>}
                      </div>
                      {(c.created_by === me || isAdmin) && <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => onDelete(c.id)} aria-label="Delete task"><Trash2 className="h-3.5 w-3.5" /></Button>}
                    </div>
                  </div>
                ))}
                {cards.filter((c) => c.col === col).length === 0 && <p className="text-xs text-muted-foreground">Nothing here.</p>}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
