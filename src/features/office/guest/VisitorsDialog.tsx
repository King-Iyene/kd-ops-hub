import { useState } from 'react';
import { Copy, DoorOpen, LogIn, Mail, UserPlus, Video, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { LABEL } from '../ui';
import { GuestRoom } from './GuestRoom';
import { STATUS_LABEL, timeLeft, validEmail } from './guestUtils';
import type { CreateGuest, GuestInvite, KnownGuest } from './useGuestInvites';

const DURATIONS: { id: CreateGuest['duration']; label: string }[] = [
  { id: 'once', label: 'One visit' },
  { id: '1d', label: '1 day' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
];

/**
 * Guests: people from outside who meet someone in a private visitor room. They have no login and cannot reach anything else.
 * Here you invite one (or invite a past guest again), let them in when they arrive, join the room, and end the visit.
 */
export function VisitorsDialog({ open, onClose, meName, isAdmin, meId, invites, known, create, decide, forget }: {
  open: boolean;
  onClose: () => void;
  meName: string;
  isAdmin: boolean;
  meId: string;
  invites: GuestInvite[];
  known: KnownGuest[];
  create: (p: CreateGuest) => Promise<{ ok: true; link: string; emailed: boolean } | { ok: false; error: string }>;
  decide: (id: string, d: 'approve' | 'deny' | 'end') => Promise<string | null>;
  forget: (guestId: string) => Promise<string | null>;
}) {
  const { toast } = useToast();
  const [pick, setPick] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [duration, setDuration] = useState<CreateGuest['duration']>('7d');
  const [auto, setAuto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{ link: string; emailed: boolean; who: string } | null>(null);
  const [room, setRoom] = useState<GuestInvite | null>(null);
  const [now, setNow] = useState(Date.now());

  const chosen = known.find((k) => k.id === pick) ?? null;
  const canSend = !busy && (chosen || (name.trim() && validEmail(email)));
  const waiting = invites.filter((i) => i.status === 'waiting');
  const inside = invites.filter((i) => i.status === 'approved' && i.session_until && new Date(i.session_until).getTime() > now);
  const rest = invites.filter((i) => !waiting.includes(i) && !inside.includes(i));

  const copy = async (link: string) => {
    try { await navigator.clipboard.writeText(link); toast({ title: 'Link copied' }); } catch { toast({ title: 'Copy this link', description: link }); }
  };
  const act = async (id: string, d: 'approve' | 'deny' | 'end', ok: string) => {
    const err = await decide(id, d);
    toast(err ? { title: 'That did not work', description: err, variant: 'destructive' } : { title: ok });
  };
  const send = async () => {
    setBusy(true);
    const res = await create(chosen ? { guestId: chosen.id, duration, autoAdmit: auto } : { name: name.trim(), email: email.trim(), duration, autoAdmit: auto });
    setBusy(false);
    if (!res.ok) { toast({ title: 'Could not invite', description: res.error, variant: 'destructive' }); return; }
    setMade({ link: res.link, emailed: res.emailed, who: chosen?.name ?? name.trim() });
    setPick(''); setName(''); setEmail(''); setAuto(false);
  };

  const card = 'rounded-xl bg-white/[0.04] ring-1 ring-white/[0.07]';
  const small = 'inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition disabled:opacity-40';
  const field = 'h-9 w-full rounded-lg bg-white/[0.06] px-2.5 text-[13px] outline-none ring-1 ring-white/[0.07] placeholder:text-muted-foreground focus:ring-primary/60';

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setMade(null); } }}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()} onOpenAutoFocus={() => setNow(Date.now())} className="ko flex max-h-[88vh] w-[calc(100vw-1.5rem)] flex-col gap-0 overflow-hidden rounded-3xl border-white/[0.08] bg-popover/95 p-0 backdrop-blur-2xl md:max-w-2xl">
          <div className="px-6 pb-3 pt-6">
            <DialogTitle className="text-xl font-extrabold tracking-tight">Guests</DialogTitle>
            <DialogDescription className="mt-1 text-[13px]">Invite someone from outside to meet you in a private visitor room. They need no account and can reach nothing else.</DialogDescription>
          </div>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-6">
            {waiting.length > 0 && (
              <section>
                <p className={`${LABEL} mb-2`}>At the door</p>
                <div className="space-y-2">
                  {waiting.map((i) => (
                    <div key={i.id} className={`${card} flex items-center gap-3 p-3`}>
                      <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-amber-400" />
                      <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-bold">{i.name}</span><span className="block truncate text-xs text-muted-foreground">is waiting to come in{i.invited_by !== meId ? ' (invited by a colleague)' : ''}</span></span>
                      <button type="button" className={`${small} bg-white/90 text-slate-900 hover:bg-white`} onClick={() => void act(i.id, 'approve', `${i.name} is in`)}><DoorOpen className="h-3.5 w-3.5" />Let in</button>
                      <button type="button" className={`${small} bg-white/[0.07] hover:bg-white/[0.13]`} onClick={() => void act(i.id, 'deny', 'Not let in')}>Not now</button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {inside.length > 0 && (
              <section>
                <p className={`${LABEL} mb-2`}>In a visit</p>
                <div className="space-y-2">
                  {inside.map((i) => (
                    <div key={i.id} className={`${card} flex items-center gap-3 p-3`}>
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" />
                      <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-bold">{i.name}</span><span className="block truncate text-xs text-muted-foreground">{timeLeft(i.session_until, now)}</span></span>
                      <button type="button" className={`${small} bg-white/90 text-slate-900 hover:bg-white`} onClick={() => setRoom(i)}><Video className="h-3.5 w-3.5" />Join room</button>
                      <button type="button" className={`${small} bg-red-500/15 text-red-400 hover:bg-red-500/25`} onClick={() => void act(i.id, 'end', 'Visit ended')}>End</button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section>
              <p className={`${LABEL} mb-2`}>Invite a guest</p>
              <div className={`${card} space-y-3 p-3.5`}>
                {known.length > 0 && (
                  <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Invite someone from before" className={field}>
                    <option value="" className="bg-popover">A new guest</option>
                    {known.map((k) => <option key={k.id} value={k.id} className="bg-popover">{k.name} · {k.email_hint}</option>)}
                  </select>
                )}
                {!chosen && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Their name" aria-label="Guest name" className={field} />
                    <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Their email" aria-label="Guest email" className={field} />
                  </div>
                )}
                <div>
                  <p className="mb-1.5 text-[11.5px] font-semibold text-muted-foreground">How long their link works</p>
                  <div className="flex flex-wrap gap-1.5">
                    {DURATIONS.map((d) => (
                      <button key={d.id} type="button" aria-pressed={duration === d.id} onClick={() => setDuration(d.id)} className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 transition ${duration === d.id ? 'bg-primary/15 text-primary ring-primary/40' : 'bg-white/[0.04] ring-white/[0.08] hover:bg-white/[0.09]'}`}>{d.label}</button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11.5px] leading-snug text-muted-foreground">{duration === 'once' ? 'One visit of 2 hours; the link works for 7 days to start it.' : 'They can visit as often as they like until it ends. Each visit lasts 2 hours.'}</p>
                </div>
                <label className="flex cursor-pointer items-start gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="mt-0.5 accent-primary" />
                  <span>Let them in without asking me each time. Anyone with their link could walk in, so only for people you trust.</span>
                </label>
                <button type="button" disabled={!canSend} onClick={() => void send()} className={`${small} h-9 w-full bg-white/90 text-slate-900 hover:bg-white`}><Mail className="h-4 w-4" />{busy ? 'Sending…' : 'Send invitation'}</button>
                {chosen && isAdmin && (
                  <button type="button" onClick={async () => { const e = await forget(chosen.id); toast(e ? { title: 'That did not work', description: e, variant: 'destructive' } : { title: `${chosen.name} removed from the list` }); setPick(''); }} className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">Remove {chosen.name} from the guest list</button>
                )}
                {made && (
                  <div className="rounded-lg bg-emerald-500/10 p-3 text-xs ring-1 ring-emerald-500/25">
                    <p className="font-semibold text-emerald-400">{made.emailed ? `Invitation emailed to ${made.who}.` : `Invitation made for ${made.who}, but the email could not be sent. Copy the link and send it yourself.`}</p>
                    <button type="button" onClick={() => void copy(made.link)} className={`${small} mt-2 bg-white/[0.08] hover:bg-white/[0.14]`}><Copy className="h-3.5 w-3.5" />Copy their link</button>
                  </div>
                )}
              </div>
            </section>

            {rest.length > 0 && (
              <section>
                <p className={`${LABEL} mb-2`}>Earlier invitations</p>
                <div className={`${card} divide-y divide-white/[0.06]`}>
                  {rest.slice(0, 30).map((i) => {
                    const over = new Date(i.expires_at).getTime() < now;
                    return (
                      <div key={i.id} className="flex items-center gap-3 px-3 py-2.5">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold">{i.name}</span>
                          <span className="block truncate text-[11.5px] text-muted-foreground">{over ? 'Link expired' : STATUS_LABEL[i.status]} · {i.duration === 'once' ? 'one visit' : i.duration.replace('d', ' days')} · {i.visits} visit{i.visits === 1 ? '' : 's'}</span>
                        </span>
                        {!over && i.status !== 'denied' && <button type="button" title="End this link" aria-label="End this link" className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-white/10" onClick={() => void act(i.id, 'end', 'Link ended')}><X className="h-4 w-4" /></button>}
                        {i.guest_id && <button type="button" className={`${small} bg-white/[0.07] hover:bg-white/[0.13]`} onClick={() => { setPick(i.guest_id!); setMade(null); }}><LogIn className="h-3.5 w-3.5" />Invite again</button>}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
            {invites.length === 0 && <p className="flex items-center gap-2 text-xs text-muted-foreground"><UserPlus className="h-3.5 w-3.5" />No guests yet. Your invitations will show here.</p>}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!room} onOpenChange={(o) => { if (!o) setRoom(null); }}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()} className="ko flex h-[88vh] w-[calc(100vw-1rem)] flex-col gap-3 rounded-3xl border-white/[0.08] bg-slate-950 p-4 md:max-w-5xl">
          <DialogTitle className="text-sm font-bold text-white">Visitor room · {room?.name}</DialogTitle>
          <DialogDescription className="sr-only">A private video room with your guest.</DialogDescription>
          <div className="relative min-h-0 flex-1">{room?.room_secret && <GuestRoom secret={room.room_secret} name={meName} note={`Meeting ${room.name}. ${timeLeft(room.session_until, now)}.`} onLeave={() => setRoom(null)} />}</div>
        </DialogContent>
      </Dialog>
    </>
  );
}
