// Screen sharing: what a presenter is showing, how everyone else is told, and when a shared screen is on or off.
// Pure functions, no browser APIs, so the rules are easy to test.

export type ShareSurface = 'monitor' | 'window' | 'browser' | 'unknown';

/** What a presenter tells the office (carried in their presence, so everyone sees it start and stop, and people who arrive later too). */
export interface ShareInfo {
  /** the id of the stream the shared screen travels in (how the other side tells a screen from a camera) */
  sid: string;
  /** the id of the stream their microphone and camera travel in */
  pid: string;
  /** the name of the window or tab, when the browser gives one */
  label: string;
  surface: ShareSurface;
}

const SURFACES: ShareSurface[] = ['monitor', 'window', 'browser'];

/** Accept only a well-formed share announcement from somebody else's presence. */
export function cleanShare(raw: unknown): ShareInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.s !== 'string' || !r.s || r.s.length > 80) return null;
  const surface = SURFACES.find((s) => s === r.k) ?? 'unknown';
  return {
    sid: r.s,
    pid: typeof r.p === 'string' ? r.p.slice(0, 80) : '',
    label: typeof r.l === 'string' ? r.l.slice(0, 80) : '',
    surface,
  };
}

/** The compact form that goes into presence. */
export function shareMeta(info: ShareInfo | null): { s: string; p: string; l: string; k: ShareSurface } | 0 {
  return info ? { s: info.sid, p: info.pid, l: info.label.slice(0, 60), k: info.surface } : 0;
}

/** The browser's own names for whole screens ("screen:0:0", "Screen 1") say nothing useful to a person. */
function usefulLabel(label: string): string {
  const t = label.trim();
  if (!t || /^(screen|monitor|display)[\s:]*\d*(:\d+)*$/i.test(t) || /^web-contents-media-stream/i.test(t)) return '';
  return t;
}

/** In words: what is being shared. `kind` is short ("Entire screen"), `title` is the window or tab name if there is one. */
export function describeShare(info: Pick<ShareInfo, 'surface' | 'label'>): { kind: string; title: string; text: string } {
  const title = usefulLabel(info.label);
  const kind = info.surface === 'monitor' ? 'Entire screen' : info.surface === 'window' ? 'A window' : info.surface === 'browser' ? 'A browser tab' : 'Their screen';
  const text = title && info.surface !== 'monitor' ? `${kind}: ${title}` : title && info.surface === 'unknown' ? title : kind;
  return { kind, title, text };
}

/**
 * Should a shared-screen picture be on view?
 *  - Once the presenter has announced the share, only the announcement decides: it stays up while it is announced (a screen
 *    that is not changing sends no new frames, and browsers then report the track as "muted"; that must not close it) and is gone
 *    the moment the presenter stops.
 *  - Without an announcement (an older version on the other side) fall back on the picture itself, but give a still screen time.
 */
export function screenVisible(a: { announced: boolean; everAnnounced: boolean; live: boolean; muted: boolean; mutedForMs: number }): boolean {
  if (!a.live) return false;
  if (a.announced) return true;
  if (a.everAnnounced) return false; // they announced a share before and have now stopped
  return !a.muted || a.mutedForMs < 12_000;
}

/** Everything that can be known about my own share, for the "you are sharing" bar. */
export function sharingBarText(info: Pick<ShareInfo, 'surface' | 'label'> | null, viewers: string[]): { headline: string; detail: string } {
  const what = info ? describeShare(info) : { text: 'your screen', kind: '', title: '' };
  const headline = info?.surface === 'monitor' ? 'You are sharing your entire screen' : info ? `You are sharing ${what.text.charAt(0).toLowerCase()}${what.text.slice(1)}` : 'You are sharing your screen';
  const detail = viewers.length === 0
    ? 'Nobody is connected yet. People who come close, or into this room, will see it.'
    : viewers.length <= 3 ? `Seen by ${viewers.join(', ')}.` : `Seen by ${viewers.slice(0, 3).join(', ')} and ${viewers.length - 3} more.`;
  return { headline, detail };
}
