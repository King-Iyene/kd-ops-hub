// Locking meeting rooms. Pure rules, no browser APIs.
//
//  - Anyone inside a meeting room can lock it. A lock lives on the person who pressed it and only counts while
//    that person is standing in that room, so a lock never outlives the meeting.
//  - Someone outside a locked room cannot walk in. They can knock; anyone inside can let them in.
//  - If the person holding the lock walks out while others stay, the lowest id among those still inside takes over,
//    so the room does not suddenly open in the middle of a meeting (unless someone unlocked on purpose).

export interface LockWho { id: string; spaceId: string | null; zone: string | null; locked: boolean }

/** Meeting rooms that are locked right now in this office. */
export function lockedRooms(roster: LockWho[], spaceId: string | null, meetingIds: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const r of roster) if (r.locked && r.spaceId === spaceId && r.zone && meetingIds.has(r.zone)) out.add(r.zone);
  return out;
}

/** May I walk into this room? Yes if it is not locked, or someone let me in. */
export function canEnter(room: string, locked: Set<string>, admitted: Set<string>): boolean {
  return !locked.has(room) || admitted.has(room);
}

/** Who is standing in this room (ids). */
export function occupants(roster: LockWho[], spaceId: string | null, room: string): string[] {
  return roster.filter((r) => r.spaceId === spaceId && r.zone === room).map((r) => r.id);
}

/**
 * A room that was locked a moment ago is not any more, yet people are still inside: should I take over the lock?
 * Only the lowest id among those inside does, and only if nobody unlocked on purpose.
 */
export function shouldTakeOver(wasLocked: boolean, isLocked: boolean, inside: string[], myId: string, unlockedOnPurpose: boolean): boolean {
  if (!wasLocked || isLocked || unlockedOnPurpose || inside.length === 0) return false;
  return [...inside].sort()[0] === myId;
}

/** Keep admissions only for rooms that are still locked (a new lock later means asking again). */
export function pruneAdmitted(admitted: Set<string>, locked: Set<string>): Set<string> {
  const next = new Set<string>();
  for (const r of admitted) if (locked.has(r)) next.add(r);
  return next;
}

/** Wire format for knocking, letting in and unlocking. */
export interface DoorMsg {
  k: 'knock' | 'let' | 'unlock';
  /** from */
  f: string;
  /** display name of the sender (knock) */
  n?: string;
  /** to (let) */
  t?: string;
  /** room id */
  r: string;
}

export function parseDoor(raw: unknown): DoorMsg | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (p.k !== 'knock' && p.k !== 'let' && p.k !== 'unlock') return null;
  if (typeof p.f !== 'string' || p.f.length > 64 || typeof p.r !== 'string' || p.r.length > 64) return null;
  if (p.t !== undefined && (typeof p.t !== 'string' || p.t.length > 64)) return null;
  const n = typeof p.n === 'string' ? p.n.slice(0, 60) : undefined;
  return { k: p.k, f: p.f, n, t: p.t as string | undefined, r: p.r };
}
