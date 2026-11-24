import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, ClipboardCopy, Globe2, Handshake, Pin, Plus, Search, Sparkles, Trash2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MAX_ZONES, ZONE_PRESETS, to12h, zoneAbbr, zoneParts } from './world/clock';

/** What an admin writes on a board: a heading and a few cards. */
export interface BoardData { title: string; cards: { h: string; t: string }[] }

/** KD brand light: cyan, gold and the teals around the logo colour. */
const ACCENTS = ['#00ECFF', '#D6AC50', '#4CC9F0', '#8EE3C8', '#F0D28A', '#5AA9E6'];
const num = (i: number) => String(i + 1).padStart(2, '0');

/** The core values wall and the notice board: everyone reads it, admins edit it. */
export function BoardDialog({ open, kind, data, canEdit, saving, onClose, onSave }: {
  open: boolean;
  kind: 'valueswall' | 'noticeboard';
  data: BoardData;
  canEdit: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (d: BoardData) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<BoardData>(data);
  const [find, setFind] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (open) { setDraft(data); setEditing(false); setFind(''); } }, [open, data]);
  const isValues = kind === 'valueswall';
  const empty = data.cards.length === 0;
  const shown = useMemo(() => {
    const n = find.trim().toLowerCase();
    return data.cards.map((c, i) => ({ c, i })).filter(({ c }) => !n || c.h.toLowerCase().includes(n) || c.t.toLowerCase().includes(n));
  }, [data.cards, find]);
  const copy = async () => {
    const text = `${data.title}\n\n` + data.cards.map((c, i) => `${i + 1}. ${c.h}${c.t ? `\n   ${c.t}` : ''}`).join('\n\n');
    try { await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked: nothing to do */ }
  };
  const move = (i: number, d: -1 | 1) => setDraft((x) => {
    const j = i + d;
    if (j < 0 || j >= x.cards.length) return x;
    const cards = [...x.cards];
    [cards[i], cards[j]] = [cards[j], cards[i]];
    return { ...x, cards };
  });
  const field = 'w-full rounded-lg border border-input bg-background/60 px-2.5 text-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/25';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()} className="ko max-h-[88vh] overflow-y-auto md:max-w-2xl">
        <DialogHeader className="space-y-1.5 pr-6">
          <p className="inline-flex w-fit items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#D6AC50]">
            {isValues ? <Sparkles className="h-3 w-3" /> : <Pin className="h-3 w-3" />}{isValues ? 'How we work' : 'Pinned for the team'}
          </p>
          <DialogTitle className="text-2xl font-extrabold tracking-tight">{editing ? 'Edit board' : data.title}</DialogTitle>
          <DialogDescription>{isValues ? 'What we stand for, and how we work.' : 'What the team should know right now.'}</DialogDescription>
        </DialogHeader>

        {!editing && (
          <>
            {!empty && data.cards.length > 5 && (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search this board" aria-label="Search this board" className={`${field} h-9 pl-9`} />
              </div>
            )}
            {empty ? (
              <div className="rounded-2xl border border-dashed border-[#00ECFF]/25 bg-[#00ECFF]/[0.04] p-8 text-center">
                <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl kd-gold">{isValues ? <Sparkles className="h-5 w-5" /> : <Pin className="h-5 w-5" />}</span>
                <p className="font-semibold">{isValues ? 'The values wall is waiting for its first value.' : 'No notices yet.'}</p>
                <p className="mt-1 text-sm text-muted-foreground">{canEdit ? 'Press Edit to write the first one.' : 'An admin will post here soon.'}</p>
              </div>
            ) : shown.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nothing matches "{find}".</p>
            ) : (
              <div className={isValues ? 'grid gap-3 sm:grid-cols-2' : 'space-y-2.5'}>
                {shown.map(({ c, i }, k) => {
                  const a = ACCENTS[i % ACCENTS.length];
                  return isValues ? (
                    <div key={i} style={{ '--i': k, '--a': a } as React.CSSProperties} className="kd-rise group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4 transition hover:-translate-y-0.5 hover:border-[var(--a)]/50 hover:bg-white/[0.06]">
                      <span className="pointer-events-none absolute -right-2 -top-3 select-none text-[64px] font-black leading-none opacity-[0.09] transition group-hover:opacity-[0.18]" style={{ color: a }}>{num(i)}</span>
                      <span className="mb-2 block h-1 w-8 rounded-full" style={{ background: a }} />
                      <p className="relative font-bold leading-snug">{c.h}</p>
                      {c.t && <p className="relative mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">{c.t}</p>}
                    </div>
                  ) : (
                    <div key={i} style={{ '--i': k } as React.CSSProperties} className="kd-rise relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.035] py-3.5 pl-5 pr-4">
                      <span className="absolute inset-y-0 left-0 w-1" style={{ background: `linear-gradient(${a},transparent)` }} />
                      <p className="flex items-start gap-2 font-bold leading-snug"><Pin className="mt-0.5 h-3.5 w-3.5 shrink-0 -rotate-45" style={{ color: a }} />{c.h}</p>
                      {c.t && <p className="mt-1.5 whitespace-pre-wrap pl-5 text-[13px] leading-relaxed text-muted-foreground">{c.t}</p>}
                    </div>
                  );
                })}
              </div>
            )}
            <DialogFooter className="items-center gap-2 sm:justify-between">
              {!empty ? (
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => void copy()}>{copied ? <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-400" /> : <ClipboardCopy className="mr-1.5 h-3.5 w-3.5" />}{copied ? 'Copied' : 'Copy as text'}</Button>
              ) : <span />}
              <span className="flex gap-2">
                <Button variant="ghost" onClick={onClose}>Close</Button>
                {canEdit && <Button onClick={() => setEditing(true)}>Edit</Button>}
              </span>
            </DialogFooter>
          </>
        )}

        {editing && (
          <>
            <label className="block text-sm font-medium">
              Heading
              <input value={draft.title} maxLength={40} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className={`${field} mt-1 h-9`} />
            </label>
            <div className="space-y-2">
              {draft.cards.map((c, i) => (
                <div key={i} className="rounded-xl border border-white/[0.08] bg-white/[0.035] p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-black" style={{ background: `${ACCENTS[i % ACCENTS.length]}22`, color: ACCENTS[i % ACCENTS.length] }}>{num(i)}</span>
                    <input value={c.h} maxLength={60} placeholder={isValues ? 'Value, for example Integrity' : 'Notice heading'} aria-label={`Card ${i + 1} heading`} onChange={(e) => setDraft({ ...draft, cards: draft.cards.map((x, j) => (j === i ? { ...x, h: e.target.value } : x)) })} className={`${field} h-8 min-w-0 flex-1`} />
                    <button type="button" aria-label="Move up" disabled={i === 0} className="rounded p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground disabled:opacity-30" onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></button>
                    <button type="button" aria-label="Move down" disabled={i === draft.cards.length - 1} className="rounded p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground disabled:opacity-30" onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></button>
                    <button type="button" aria-label="Remove" className="rounded p-1.5 text-muted-foreground hover:bg-red-500/15 hover:text-red-400" onClick={() => setDraft({ ...draft, cards: draft.cards.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <textarea value={c.t} maxLength={400} rows={2} placeholder={isValues ? 'What it means for us' : 'The details'} aria-label={`Card ${i + 1} details`} onChange={(e) => setDraft({ ...draft, cards: draft.cards.map((x, j) => (j === i ? { ...x, t: e.target.value } : x)) })} className={`${field} mt-2 py-1.5`} />
                  <p className="mt-1 text-right text-[10px] tabular-nums text-muted-foreground">{c.t.length}/400</p>
                </div>
              ))}
              {draft.cards.length < 12 && (
                <Button variant="outline" size="sm" className="border-[#00ECFF]/25 bg-transparent" onClick={() => setDraft({ ...draft, cards: [...draft.cards, { h: '', t: '' }] })}><Plus className="mr-1.5 h-4 w-4" />Add a card ({draft.cards.length}/12)</Button>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => { setDraft(data); setEditing(false); }}>Cancel</Button>
              <Button disabled={saving} onClick={() => onSave({ title: draft.title.trim() || data.title, cards: draft.cards.filter((c) => c.h.trim() || c.t.trim()) })}>{saving ? 'Saving…' : 'Save board'}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}


/** Office hours are 8 AM to 6 PM where the person is. */
const isWorking = (h: number) => h >= 8 && h < 18;
/** Whole hours a place is ahead (+) or behind (-) the viewer, or null when it cannot be worked out. */
function offsetFromMe(zone: string, now: number): number | null {
  try {
    const mine = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const a = zoneParts(zone, now); const b = zoneParts(mine, now);
    let d = (a.h * 60 + a.m) - (b.h * 60 + b.m);
    if (d > 720) d -= 1440; else if (d <= -720) d += 1440;
    return Math.round(d / 60);
  } catch { return null; }
}
/** The first stretch in the next 24 hours when every shown place is inside office hours, written in the viewer's own time. */
function meetingWindow(zones: string[], now: number): string | null {
  const STEP = 30 * 60_000;
  let start = -1; let end = -1;
  for (let k = 0; k < 48; k++) {
    const t = now + k * STEP;
    const ok = zones.every((z) => isWorking(zoneParts(z, t).h));
    if (ok && start < 0) start = t;
    if (ok) end = t + STEP;
    if (!ok && start >= 0) break;
  }
  if (start < 0) return null;
  const f = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const same = new Date(start).toDateString() === new Date(now).toDateString();
  return `${same ? 'today' : 'tomorrow'} ${f(start)} to ${f(end)}`;
}

/** The wall clock: big live times for up to three places. Admins choose which. */
export function ClockDialog({ open, zones, canEdit, saving, onClose, onSave }: {
  open: boolean;
  zones: string[];
  canEdit: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (z: string[]) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [draft, setDraft] = useState<string[]>(zones);
  useEffect(() => { if (open) setDraft(zones); }, [open, zones]);
  useEffect(() => {
    if (!open) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [open]);

  const toggle = (id: string) => setDraft((d) => (d.includes(id) ? (d.length > 1 ? d.filter((x) => x !== id) : d) : d.length < MAX_ZONES ? [...d, id] : d));
  const changed = draft.join() !== zones.join();

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()} className="ko max-w-lg">
        <DialogHeader className="space-y-1.5 pr-6">
          <p className="inline-flex w-fit items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#D6AC50]"><Globe2 className="h-3 w-3" />Live</p>
          <DialogTitle className="text-2xl font-extrabold tracking-tight">Time around the world</DialogTitle>
          <DialogDescription>Where the team and our partners are right now.</DialogDescription>
        </DialogHeader>
        <div className={`grid gap-3 ${zones.length === 1 ? '' : zones.length === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-3'}`}>
          {zones.map((z, k) => {
            const { h, m, s } = zoneParts(z, now);
            const t12 = to12h(h);
            const city = ZONE_PRESETS.find((p) => p.id === z)?.city ?? z;
            const working = isWorking(h);
            const day = h >= 6 && h < 18;
            const off = offsetFromMe(z, now);
            return (
              <div key={z} style={{ '--i': k } as React.CSSProperties} className="kd-rise relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 text-center">
                <span className="absolute right-2.5 top-2.5 text-base" aria-hidden>{day ? '☀️' : '🌙'}</span>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{city} · {zoneAbbr(z, now)}</p>
                <p className="mt-1.5 font-mono text-3xl font-semibold tabular-nums">{t12.h12}:{String(m).padStart(2, '0')}<span className="text-lg text-muted-foreground">:{String(s).padStart(2, '0')}</span><span className="ml-1.5 text-sm font-semibold text-muted-foreground">{t12.pm ? 'PM' : 'AM'}</span></p>
                <div className="mx-auto mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10" aria-hidden>
                  <div className="h-full rounded-full" style={{ width: `${((h * 60 + m) / 1440) * 100}%`, background: 'linear-gradient(90deg,#006994,#00ECFF,#D6AC50)' }} />
                </div>
                <p className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5">
                  <span className={`kd-chip ${working ? '' : 'opacity-60'}`}>{working ? 'In office hours' : 'Outside office hours'}</span>
                  {off !== null && <span className="text-[11px] text-muted-foreground">{off === 0 ? 'Same time as you' : `${Math.abs(off)}h ${off > 0 ? 'ahead of' : 'behind'} you`}</span>}
                </p>
              </div>
            );
          })}
        </div>
        {zones.length > 1 && (() => {
          const w = meetingWindow(zones, now);
          return (
            <div className="flex items-start gap-2.5 rounded-xl border border-[#D6AC50]/25 bg-[#D6AC50]/[0.07] px-3.5 py-2.5 text-[13px]">
              <Handshake className="mt-0.5 h-4 w-4 shrink-0 text-[#D6AC50]" />
              <p><span className="font-semibold">Best time to meet everyone: </span>{w ? <>{w}<span className="text-muted-foreground"> (your time)</span></> : <span className="text-muted-foreground">there are no shared office hours in the next 24 hours.</span>}</p>
            </div>
          );
        })()}
        {canEdit && (
          <div>
            <p className="mb-1.5 text-sm font-medium">Show up to {MAX_ZONES} places on the wall clock</p>
            <div className="flex flex-wrap gap-1.5">
              {ZONE_PRESETS.map((p) => {
                const on = draft.includes(p.id);
                return (
                  <button key={p.id} type="button" onClick={() => toggle(p.id)} aria-pressed={on} className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition ${on ? 'border-primary/60 bg-primary/15 font-semibold text-primary' : 'border-white/10 hover:bg-white/[0.07]'}`}>
                    {p.city}{on && <X className="h-3 w-3" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          {canEdit && <Button disabled={!changed || saving} onClick={() => onSave(draft)}>{saving ? 'Saving…' : 'Save clock'}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
