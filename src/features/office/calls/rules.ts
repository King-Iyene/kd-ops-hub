// Who can hear whom in the virtual office. Pure functions, no browser APIs, so the rules are easy to test.
//
//  - Out in the open (open floor, lounge, personal office): you hear people within NEAR steps, quieter the further away.
//  - Inside a meeting room: you hear everybody in that same room at any distance, and nobody outside it.
//    People outside cannot hear you either.

/** Start talking to someone closer than this many tiles. */
export const NEAR = 5;
/** Stop talking only once they are further than this (a little wider, so walking at the edge does not flicker). */
export const FAR = 6.5;

/** Where someone is standing. room is the id of the meeting room they are inside, or null in the open. */
export interface Spot {
  x: number;
  y: number;
  room: string | null;
  /** speaking to the whole office (a town hall) */
  live?: boolean;
  /** has switched the town hall off for themselves */
  townMuted?: boolean;
}

/** When exactly one of the two is speaking to the whole office: who speaks and who may listen. */
function townHall(a: Spot, b: Spot): { speaker: Spot; listener: Spot } | null {
  if (a.live === b.live) return null;
  return a.live ? { speaker: a, listener: b } : { speaker: b, listener: a };
}

/** Can this listener hear the town hall? Not if they switched it off, and not from inside a private room (unless it is the speaker's own room). */
function hearsTownHall(listener: Spot, speaker: Spot): boolean {
  return !listener.townMuted && (!listener.room || listener.room === speaker.room);
}

export function distance(a: Spot, b: Spot): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Should these two people be connected? `connected` is true when they already are (uses the wider limit). */
export function wantsConnection(me: Spot, other: Spot, connected: boolean, occluded = false): boolean {
  // a town hall reaches everyone who is listening, wherever they are in the office
  const th = townHall(me, other);
  if (th && hearsTownHall(th.listener, th.speaker)) return true;
  if (me.room || other.room) return me.room === other.room;
  // out in the open, a wall between two people blocks the sound
  if (occluded) return false;
  return distance(me, other) <= (connected ? FAR : NEAR);
}

/** How loud the other person is for me, 0 to 1. Full volume inside a meeting room or when close, fading with distance. */
export function volumeFor(me: Spot, other: Spot, occluded = false): number {
  // the speaker hears nobody (no echo from the audience), and the audience hears the speaker at full volume
  if (me.live && !other.live) return 0;
  if (other.live && !me.live) return hearsTownHall(me, other) ? 1 : 0;
  if (me.room && me.room === other.room) return 1;
  if (me.room || other.room) return 0;
  if (occluded) return 0;
  const d = distance(me, other);
  if (d <= 1.5) return 1;
  if (d >= FAR) return 0;
  return Math.max(0.08, 1 - (d - 1.5) / (FAR - 1.5));
}

/** The two ends of a connection must agree who starts it, so they never both start at once. */
export function isInitiator(myId: string, otherId: string): boolean {
  return myId < otherId;
}

/** Wire format for connection set-up messages sent through the office channel. */
export interface RtcSignal {
  /** from */
  f: string;
  /** to */
  t: string;
  /** 'sdp' = offer or answer, 'ice' = network candidate, 'rst' = "this connection is stuck, drop yours and we start again" */
  k: 'sdp' | 'ice' | 'rst';
  d: unknown;
}

/** Accept only well-formed set-up messages addressed to me. */
export function parseSignal(raw: unknown, myId: string): RtcSignal | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.f !== 'string' || typeof p.t !== 'string' || p.f.length > 64 || p.t !== myId || p.f === myId) return null;
  if (p.k !== 'sdp' && p.k !== 'ice' && p.k !== 'rst') return null;
  if (!p.d || typeof p.d !== 'object') return null;
  return { f: p.f, t: p.t, k: p.k, d: p.d };
}
