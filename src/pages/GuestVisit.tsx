import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { GuestRoom } from '@/features/office/guest/GuestRoom';
import { timeLeft } from '@/features/office/guest/guestUtils';
import { useOfficeFont } from '@/features/office/ui';

/**
 * The page a guest opens from their emailed link. No account, no sign-in, and no way to anywhere else in KD Ops:
 * it only talks to the office-guest function with the link, and, once let in, to one private visitor room.
 */
type Phase = 'loading' | 'invited' | 'waiting' | 'approved' | 'denied' | 'ended' | 'used' | 'expired' | 'invalid' | 'slow';
interface Reply { status: Phase; name?: string; host?: string; space?: string; secret?: string; until?: string }

export default function GuestVisit() {
  useOfficeFont();
  const { token = '' } = useParams();
  const [reply, setReply] = useState<Reply>({ status: 'loading' });
  const [inRoom, setInRoom] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const poll = useRef<number | undefined>(undefined);

  const call = useCallback(async (action: 'knock' | 'status'): Promise<Reply> => {
    try {
      const { data } = await supabase.functions.invoke('office-guest', { body: { action, token } });
      return (data as Reply | null) ?? { status: 'invalid' };
    } catch {
      return { status: 'invalid' };
    }
  }, [token]);

  // first look: what is this link? (opening the link does not knock; the guest presses the button)
  useEffect(() => { void call('status').then(setReply); }, [call]);

  // while waiting, ask every few seconds whether we have been let in; while in the room, make sure the visit is still on
  useEffect(() => {
    window.clearInterval(poll.current);
    if (reply.status === 'waiting') {
      poll.current = window.setInterval(() => { void call('status').then((r) => { if (r.status !== 'waiting') setReply(r); }); }, 3000);
    } else if (inRoom) {
      poll.current = window.setInterval(() => { void call('status').then((r) => { if (r.status !== 'approved') { setInRoom(false); setReply(r); } }); }, 20000);
    }
    return () => window.clearInterval(poll.current);
  }, [reply.status, inRoom, call]);
  useEffect(() => { const t = window.setInterval(() => setClock(Date.now()), 30000); return () => window.clearInterval(t); }, []);

  const name = reply.name ?? 'Guest';
  const shell = (children: React.ReactNode) => (
    <div className="ko flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-4 text-white">
      <div className="w-full max-w-md rounded-3xl bg-white/[0.06] p-8 text-center shadow-2xl ring-1 ring-white/10 backdrop-blur-xl">
        <p className="mb-5 text-[11px] font-bold uppercase tracking-[0.2em] text-white/50">KD Squares</p>
        {children}
      </div>
    </div>
  );
  const message = (title: string, body: string) => shell(<><h1 className="text-xl font-extrabold tracking-tight">{title}</h1><p className="mt-2 text-sm leading-relaxed text-white/65">{body}</p></>);

  if (inRoom && reply.status === 'approved' && reply.secret) {
    return (
      <div className="ko fixed inset-0 flex flex-col bg-slate-950 p-3 sm:p-5">
        <div className="mb-3 flex items-center justify-between text-white">
          <p className="text-sm font-bold">{reply.space} · visitor room</p>
          <p className="text-xs text-white/60">{timeLeft(reply.until, clock)}</p>
        </div>
        <div className="relative min-h-0 flex-1"><GuestRoom secret={reply.secret} name={name} note={`You are meeting ${reply.host}.`} onLeave={() => setInRoom(false)} /></div>
      </div>
    );
  }

  switch (reply.status) {
    case 'loading':
      return shell(<div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />);
    case 'invited':
      return shell(<>
        <h1 className="text-2xl font-extrabold tracking-tight">Hi {name}</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/65">{reply.host} invited you to visit {reply.space}. You will meet on video in a private room. No account or download is needed.</p>
        <button type="button" onClick={() => void call('knock').then(setReply)} className="mt-6 h-11 w-full rounded-xl bg-white text-sm font-bold text-slate-900 transition hover:bg-white/90">Ask to come in</button>
      </>);
    case 'waiting':
      return shell(<>
        <div className="mx-auto mb-4 h-3 w-3 animate-pulse rounded-full bg-amber-400 shadow-[0_0_18px] shadow-amber-400" />
        <h1 className="text-xl font-extrabold tracking-tight">Waiting for {reply.host}</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/65">They have been told you are at the door. Keep this page open and you will be let in as soon as they say yes.</p>
      </>);
    case 'approved':
      return shell(<>
        <h1 className="text-2xl font-extrabold tracking-tight">You are in, {name}</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/65">{reply.host} let you in. Your browser will ask to use your camera and microphone.</p>
        <button type="button" onClick={() => setInRoom(true)} className="mt-6 h-11 w-full rounded-xl bg-white text-sm font-bold text-slate-900 transition hover:bg-white/90">Join the visitor room</button>
        <p className="mt-3 text-xs text-white/45">{timeLeft(reply.until, clock)}</p>
      </>);
    case 'denied':
      return message('Not right now', `${reply.host ?? 'The host'} could not let you in just now. You can try again later with the same link.`);
    case 'ended':
      return shell(<>
        <h1 className="text-xl font-extrabold tracking-tight">Your visit has ended</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/65">Thanks for visiting. If your link still works you can ask to come in again.</p>
        <button type="button" onClick={() => void call('knock').then(setReply)} className="mt-6 h-11 w-full rounded-xl bg-white/10 text-sm font-bold text-white transition hover:bg-white/20">Ask to come in again</button>
      </>);
    case 'used':
      return message('This link was for one visit', 'It has been used. Ask whoever invited you to send a new one.');
    case 'expired':
      return message('This link has expired', 'Ask whoever invited you to send a new one.');
    case 'slow':
      return message('Please wait a moment', 'Too many tries in a row. Wait a minute and refresh this page.');
    default:
      return message('This link is not valid', 'Check you opened the whole link from your email, or ask whoever invited you to send it again.');
  }
}
