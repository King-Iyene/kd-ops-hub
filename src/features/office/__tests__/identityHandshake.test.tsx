import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

// A pretend realtime service: broadcasts reach every other channel on the same topic, and who the online list (presence) shows
// to whom can be controlled, to recreate "the list dropped somebody".
type Handler = { type: string; event: string; cb: (p: { payload?: unknown }) => void };
const h = vi.hoisted(() => {
  const state = {
    channels: [] as unknown[],
    tracked: new Map<string, unknown>(),
    hiddenFrom: new Map<string, Set<string>>(), // viewer key -> keys it must not see in presence
  };
  return state;
});

class FakeChannel {
  topic: string;
  key: string;
  state = 'joined';
  handlers: Handler[] = [];
  constructor(topic: string, cfg: { config?: { presence?: { key?: string } } }) { this.topic = topic; this.key = cfg?.config?.presence?.key ?? ''; }
  on(type: string, filter: { event: string }, cb: Handler['cb']) { this.handlers.push({ type, event: filter.event, cb }); return this; }
  subscribe(cb?: (s: string) => void) { h.channels.push(this); setTimeout(() => cb?.('SUBSCRIBED'), 0); return this; }
  async send(msg: { type: string; event: string; payload: unknown }) {
    for (const c of h.channels as FakeChannel[]) {
      if (c === this || c.topic !== this.topic) continue;
      for (const hd of c.handlers) if (hd.type === msg.type && hd.event === msg.event) hd.cb({ payload: msg.payload });
    }
    return 'ok';
  }
  async track(meta: unknown) {
    h.tracked.set(this.key, meta);
    for (const c of h.channels as FakeChannel[]) if (c.topic === 'office:lobby') for (const hd of c.handlers) if (hd.type === 'presence') hd.cb({});
  }
  presenceState() {
    const hide = h.hiddenFrom.get(this.key) ?? new Set<string>();
    const out: Record<string, unknown[]> = {};
    for (const [k, m] of h.tracked) if (!hide.has(k)) out[k] = [m];
    return out;
  }
}
vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: (topic: string, cfg: never) => new FakeChannel(topic, cfg),
    removeChannel: (ch: unknown) => { h.channels = (h.channels as unknown[]).filter((c) => c !== ch); },
  },
}));

import { useOffice } from '../useOffice';
import { defaultAvatar } from '../world/render';

const flush = async (ms = 50) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); };
/** wait (up to a time limit) until something is true, instead of guessing how long the pretend network takes */
const until = async (cond: () => boolean, limitMs = 8000) => {
  const end = Date.now() + limitMs;
  while (!cond() && Date.now() < end) await flush(100);
};

describe('everybody who is here is shown with their own name, even when the online list drops them', () => {
  beforeEach(() => { vi.useRealTimers(); h.channels = []; h.tracked.clear(); h.hiddenFrom.clear(); });
  afterEach(() => { h.channels = []; });

  it('learns a name from the person themselves, and lists them', async () => {
    const nina = renderHook(() => useOffice({ id: 'user-nina', name: 'Nina Okari', avatar: defaultAvatar('user-nina') }, 'space1'));
    const king = renderHook(() => useOffice({ id: 'user-king', name: 'King Iyene', avatar: defaultAvatar('user-king') }, 'space1'));
    await flush(100);
    // the online list drops Nina for King (what used to leave her as "Someone")
    h.hiddenFrom.set(king.result.current.connId, new Set([nina.result.current.connId]));
    await act(async () => { await king.result.current.update({ x: 5, y: 5, vx: 0, vy: 0 }, 0, Date.now()); });
    // Nina walks: King hears her move
    await act(async () => { nina.result.current.update({ x: 6, y: 5, vx: 1, vy: 0 }, 1, Date.now()); });
    await flush(100);
    expect(king.result.current.roster.some((w) => w.name === 'Nina Okari')).toBe(false); // not yet: nobody has asked
    expect(king.result.current.isKnown(nina.result.current.connId)).toBe(false);
    // King's client notices an unknown mover and asks who it is; Nina answers
    await until(() => king.result.current.isKnown(nina.result.current.connId));
    expect(king.result.current.isKnown(nina.result.current.connId)).toBe(true);
    const names = king.result.current.roster.map((w) => w.name);
    expect(names).toContain('Nina Okari');
    expect(names).not.toContain('Someone');
  }, 20000);

  it('never lists another window of the same account', async () => {
    const a = renderHook(() => useOffice({ id: 'user-king', name: 'King Iyene', avatar: defaultAvatar('user-king') }, 'space1'));
    const b = renderHook(() => useOffice({ id: 'user-king', name: 'King Iyene', avatar: defaultAvatar('user-king') }, 'space1'));
    await flush(100);
    h.hiddenFrom.set(a.result.current.connId, new Set([b.result.current.connId]));
    await act(async () => { b.result.current.update({ x: 6, y: 5, vx: 1, vy: 0 }, 1, Date.now()); });
    await until(() => a.result.current.isKnown(b.result.current.connId));
    expect(a.result.current.roster.some((w) => w.id === b.result.current.connId)).toBe(false);
    expect(a.result.current.isKnown(b.result.current.connId)).toBe(true); // known, but it is me
  }, 20000);
});
