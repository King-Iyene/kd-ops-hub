// Who somebody is, even when the online list (the lobby's presence) has not told us.
//
// The online list is rate limited and arrives a little after people do, and it can drop someone altogether under load, but a person's
// movement and voice reach us at once. Without a second source of names those people showed up as "Someone". So anybody we hear moving
// whom the list does not know is asked who they are (a tiny "who" on the office channel); they answer with their name, account and
// picture ("iam"), and the people list is completed with them until the online list catches up. Pure functions, easy to test.

import type { Who } from '../useOffice';
import type { AvatarStyle } from './types';

export interface Ident { uid: string; name: string; avatar: AvatarStyle; since: number; at: number }

/** Read an "iam" answer from the network (another client could send anything). */
export function cleanIdent(raw: unknown, clean: (a: unknown, uid: string) => AvatarStyle, now: number): { id: string; ident: Ident } | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.i !== 'string' || !o.i || o.i.length > 64) return null;
  if (typeof o.u !== 'string' || !o.u || o.u.length > 64) return null;
  if (typeof o.n !== 'string' || !o.n.trim()) return null;
  return { id: o.i, ident: { uid: o.u, name: o.n.trim().slice(0, 60), avatar: clean(o.a, o.u), since: typeof o.c === 'number' && Number.isFinite(o.c) ? o.c : 0, at: now } };
}

/** Whom to ask: heard moving for a moment, still unknown, and not asked about very recently. Marks the ones returned as asked. */
export function unknownToAsk(
  heard: Iterable<string>,
  known: (id: string) => boolean,
  firstUnknown: Map<string, number>,
  asked: Map<string, number>,
  now: number,
  o: { graceMs?: number; repeatMs?: number; max?: number } = {},
): string[] {
  const grace = o.graceMs ?? 1000;
  const repeat = o.repeatMs ?? 6000;
  const max = o.max ?? 16;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of heard) {
    seen.add(id);
    if (known(id)) { firstUnknown.delete(id); continue; }
    const first = firstUnknown.get(id) ?? now;
    if (!firstUnknown.has(id)) firstUnknown.set(id, now);
    if (now - first < grace) continue;
    if (now - (asked.get(id) ?? -Infinity) < repeat) continue;
    asked.set(id, now);
    out.push(id);
    if (out.length >= max) break;
  }
  for (const id of [...firstUnknown.keys()]) if (!seen.has(id)) { firstUnknown.delete(id); asked.delete(id); }
  return out;
}

/**
 * The online list, completed with people we hear moving and who have told us who they are. The online list always wins for anyone it
 * lists (by tab or by account); somebody's other window of mine is left out; the newest window of one account is the one shown.
 */
export function completeRoster(
  presence: Who[],
  idents: Map<string, Ident>,
  heard: Map<string, { at: number }>,
  o: { now: number; selfUid: string | null; multi: boolean; spaceId: string | null; freshMs: number },
  /** reuse the same entry for the same person (so the screen is not told something changed when nothing did) */
  cache?: Map<string, Who>,
): Who[] {
  const listedIds = new Set(presence.map((w) => w.id));
  const listedUids = new Set(presence.map((w) => w.uid));
  const best = new Map<string, { id: string; ident: Ident }>();
  for (const [id, pm] of heard) {
    const ident = idents.get(id);
    if (!ident || listedIds.has(id) || listedUids.has(ident.uid)) continue;
    if (o.now - pm.at >= o.freshMs) continue; // not heard moving lately: gone
    if (!o.multi && ident.uid === o.selfUid) continue; // another window of me
    const cur = best.get(ident.uid);
    if (!cur || ident.since > cur.ident.since || (ident.since === cur.ident.since && id > cur.id)) best.set(ident.uid, { id, ident });
  }
  if (!best.size) return presence;
  const extra: Who[] = [...best.values()].map(({ id, ident }) => {
    const key = `${id}|${ident.uid}|${ident.name}|${o.spaceId}|${ident.since}`;
    const hit = cache?.get(key);
    if (hit) return hit;
    const w: Who = { id, uid: ident.uid, since: ident.since, name: ident.name, avatar: ident.avatar, spaceId: o.spaceId, zone: null, rec: false, locked: false, status: '', riding: false, live: false, townMuted: false };
    cache?.set(key, w);
    return w;
  });
  return [...presence, ...extra];
}
