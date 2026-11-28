import { useEffect, useRef, useState } from 'react';
import { openMailbox } from './CrewMailbox';
import { useAuthStore } from '@/store/authStore';
import { X } from 'lucide-react';
import { AvatarFace } from '@/features/office/AvatarFace';
import { agentAvatar } from '@/features/office/world/agents';
import { cdb, type CrewAgent } from './crewDb';
import { useCrewAgents, useCrewAttention } from './useCrew';

/** A soft two-note chime (no sound file, no service). Silent if the browser has not allowed sound yet. */
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [660, 880].forEach((hz, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = hz;
      g.gain.setValueAtTime(0.0001, now + i * 0.16);
      g.gain.exponentialRampToValueAtTime(0.12, now + i * 0.16 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.16 + 0.35);
      o.connect(g).connect(ctx.destination);
      o.start(now + i * 0.16);
      o.stop(now + i * 0.16 + 0.4);
    });
    window.setTimeout(() => void ctx.close().catch(() => undefined), 900);
  } catch { /* no sound is fine */ }
}

interface Banner { id: string; agent?: CrewAgent; who: string; title: string; body: string; kind: string; more: number }

/**
 * Tells the owner when an executive writes to him, the way Slack does: a big card in the top right corner with the executive's face, name and role,
 * the message itself in readable type, and Open (reads and answers it in the mailbox) and Dismiss buttons, plus a soft chime. If desktop alerts are
 * allowed it also pops a system notification when the app is in the background. It stays quiet on the first load (it only announces what arrives
 * while the app is open). Mounted once for the owner; everyone else makes no request.
 */
export function CrewNotifier() {
  const isSuper = useAuthStore((s) => s.profile?.role === 'super_admin');
  const attention = useCrewAttention(isSuper);
  const agents = useCrewAgents();
  const seen = useRef<Set<string> | null>(null);
  const [banners, setBanners] = useState<Banner[]>([]);
  const dismiss = (id: string) => setBanners((b) => b.filter((x) => x.id !== id));

  useEffect(() => {
    if (!isSuper) return;
    const ids = attention.unread.map((m) => m.id);
    if (seen.current === null) { if (agents.data || attention.unread.length === 0) seen.current = new Set(ids); return; }
    const fresh = attention.unread.filter((m) => !seen.current!.has(m.id));
    fresh.forEach((m) => seen.current!.add(m.id));
    if (fresh.length === 0) return;
    const m = fresh[0];
    const agent = agents.data?.find((a) => a.id === m.from_agent);
    const who = agent?.name.split(' ')[0] ?? 'An executive';
    const banner: Banner = { id: m.id, agent, who, title: agent?.title ?? '', body: m.body, kind: m.kind, more: fresh.length - 1 };
    setBanners((b) => [banner, ...b.filter((x) => x.id !== m.id)].slice(0, 3));
    window.setTimeout(() => dismiss(m.id), 25_000);
    chime();
    try {
      if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
        const n = new Notification(who + (agent ? ', ' + agent.title : ''), { body: m.body.slice(0, 240), tag: 'crew-' + m.id });
        n.onclick = () => { window.focus(); openMailbox(m.id); n.close(); };
      }
    } catch { /* desktop alerts are optional */ }
  }, [attention.unread, agents.data, isSuper]);

  // "online" for the executives: the owner has the app open and visible. They only watch the system for events while this beats.
  useEffect(() => {
    if (!isSuper) return;
    const ping = () => { if (document.visibilityState === 'visible') void Promise.resolve(cdb.rpc('crew_owner_ping')).then(() => undefined, () => undefined); };
    ping();
    const t = window.setInterval(ping, 120_000);
    return () => window.clearInterval(t);
  }, [isSuper]);

  if (banners.length === 0) return null;
  return (
    <div className="pointer-events-none fixed right-4 top-16 z-[70] flex w-[min(26rem,calc(100vw-2rem))] flex-col gap-3" aria-live="polite">
      {banners.map((b) => (
        <div key={b.id} className="pointer-events-auto overflow-hidden rounded-xl border border-primary/40 bg-card shadow-2xl ring-1 ring-black/20">
          <div className="flex gap-3 p-4">
            {b.agent ? <AvatarFace avatar={agentAvatar(b.agent)} size={52} /> : <span className="h-[52px] w-[52px] shrink-0 rounded-full bg-muted" />}
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline gap-2"><span className="text-base font-bold">{b.who}</span><span className="truncate text-xs text-muted-foreground">{b.title}</span><span className="ml-auto shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">{b.kind}</span></p>
              <p className="mt-1 line-clamp-6 whitespace-pre-wrap text-[14.5px] leading-snug">{b.body}</p>
              {b.more > 0 ? <p className="mt-1 text-xs text-muted-foreground">and {b.more} more message{b.more > 1 ? 's' : ''}</p> : null}
            </div>
            <button type="button" aria-label="Dismiss" onClick={() => dismiss(b.id)} className="h-6 w-6 shrink-0 rounded text-muted-foreground hover:bg-muted"><X className="mx-auto h-4 w-4" /></button>
          </div>
          <div className="flex gap-2 border-t bg-muted/30 px-4 py-2">
            <button type="button" onClick={() => { openMailbox(b.id); dismiss(b.id); }} className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90">Open and reply</button>
            <button type="button" onClick={() => dismiss(b.id)} className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted">Dismiss</button>
          </div>
        </div>
      ))}
    </div>
  );
}
