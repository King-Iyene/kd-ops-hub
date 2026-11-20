import { useEffect, useRef } from 'react';
import type { Who } from './useOffice';
import type { AvatarStyle } from './world/types';

/**
 * The KD Ops desktop app shows a small always-on-top window ("mini mode") with who is around and your status, and sets Do not disturb
 * while the computer is locked or asleep. This is the page's side of both: it tells the app who is around, and it obeys the status the
 * small window asks for. In a browser none of it exists and nothing happens.
 */
interface Desk {
  miniUpdate?: (state: unknown) => void;
  onSetStatus?: (cb: (id: string) => void) => () => void;
  onPower?: (cb: (state: string) => void) => () => void;
}
const desk = (): Desk | undefined => (typeof window === 'undefined' ? undefined : (window as unknown as { kdDesktop?: Desk }).kdDesktop);

const look = (a?: Pick<AvatarStyle, 'skin' | 'hair' | 'shirt'>) => ({ skin: a?.skin, hair: a?.hair, shirt: a?.shirt });

/** What the small window shows: me, and up to 14 other people (one entry per person, however many tabs they have open). */
export function miniPayload(me: { name: string; avatar?: AvatarStyle }, status: string, roster: Pick<Who, 'uid' | 'name' | 'status' | 'avatar'>[], myUid: string) {
  const seen = new Set<string>([myUid]);
  const people: { id: string; name: string; status: string; a: ReturnType<typeof look> }[] = [];
  for (const r of roster) {
    if (seen.has(r.uid)) continue;
    seen.add(r.uid);
    people.push({ id: r.uid, name: r.name, status: r.status || '', a: look(r.avatar) });
    if (people.length >= 14) break;
  }
  return { me: { name: me.name, status, a: look(me.avatar) }, people };
}

/**
 * Do not disturb while the computer is locked or asleep, then back to how it was.
 * `before` is the status to go back to (null when we did not change anything). Someone already on Do not disturb is left alone.
 */
export function autoDnd(before: string | null, current: string, event: 'away' | 'back'): { before: string | null; set: string | null } {
  if (event === 'away') {
    if (before !== null || current === 'dnd') return { before, set: null };
    return { before: current, set: 'dnd' };
  }
  return before !== null ? { before: null, set: before } : { before: null, set: null };
}

export function useDesktopMini(p: { name: string; avatar?: AvatarStyle; status: string; roster: Who[]; myUid: string; onStatus: (id: string) => void }) {
  const sent = useRef('');
  useEffect(() => {
    const d = desk();
    if (!d?.miniUpdate || !p.name) return;
    const payload = miniPayload({ name: p.name, avatar: p.avatar }, p.status, p.roster, p.myUid);
    const key = JSON.stringify(payload);
    if (key === sent.current) return;
    sent.current = key;
    d.miniUpdate(payload);
  }, [p.name, p.avatar, p.status, p.roster, p.myUid]);

  const latest = useRef({ status: p.status, onStatus: p.onStatus });
  latest.current = { status: p.status, onStatus: p.onStatus };
  useEffect(() => {
    const d = desk();
    if (!d) return;
    const offStatus = d.onSetStatus?.((id) => { if (id === 'available') latest.current.onStatus(''); else if (id === 'busy' || id === 'dnd') latest.current.onStatus(id); });
    let before: string | null = null;
    const offPower = d.onPower?.((state) => {
      const r = autoDnd(before, latest.current.status, state === 'away' ? 'away' : 'back');
      before = r.before;
      if (r.set !== null) latest.current.onStatus(r.set);
    });
    return () => { offStatus?.(); offPower?.(); };
  }, []);
}
