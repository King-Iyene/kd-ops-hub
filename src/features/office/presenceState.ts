import { isActiveRecently, seenLabel } from './lastSeen';

/** How somebody shows up, the same everywhere (people list, chat, the card on the map, the profile card): in the Office, using the app somewhere else, or away. */
export type PresenceKind = 'office' | 'app' | 'offline';
export interface PresenceInfo { kind: PresenceKind; label: string; color: string }

export const PRESENCE_COLOR: Record<PresenceKind, string> = { office: '#34d399', app: '#00ECFF', offline: '#94a3b8' };

/**
 * `inOffice`: the Office's online list shows them (a status such as "Busy" then says more). Otherwise, anybody seen in the app in the last
 * few minutes is "Active in the app", and everybody else is away, with when they were last seen.
 */
export function presenceInfo(inOffice: boolean, seenAt: string | number | null | undefined, status: string | null = null, now: number = Date.now()): PresenceInfo {
  if (inOffice) return { kind: 'office', label: status || 'Available', color: PRESENCE_COLOR.office };
  if (isActiveRecently(seenAt, now)) return { kind: 'app', label: 'Active in the app', color: PRESENCE_COLOR.app };
  return { kind: 'offline', label: seenAt ? seenLabel(seenAt, now) : 'Offline', color: PRESENCE_COLOR.offline };
}
