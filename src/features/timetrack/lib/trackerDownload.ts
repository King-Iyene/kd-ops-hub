import { feedDownload, feedOsFor, feedUrl, readFeed, saveFromUrl, type FeedOs } from '@/features/office/desktopApp';

/**
 * The KD Ops Time Tracker installers, served from the same update feed the installed tracker updates itself from (our own public
 * storage, never GitHub: the repository is private, so a GitHub link would send people to a login or error page). The Download buttons
 * read the feed's small version file to learn which installer is the newest, so a download and an update can never disagree.
 * If the feed has nothing yet, the person is told so in the app and nothing opens.
 */
export type TrackerOs = FeedOs;

export const TRACKER_OSES: { os: TrackerOs; label: string }[] = [
  { os: 'windows', label: 'Windows (.exe)' },
  { os: 'mac', label: 'Mac, Apple chip (.dmg)' },
  { os: 'linux', label: 'Linux (.AppImage)' },
];

/** Which version is on the feed (null when there is none yet). */
export async function fetchTrackerVersion(): Promise<string | null> {
  try {
    const r = await fetch(`${feedUrl('tracker')}/latest.yml`, { cache: 'no-store' });
    if (!r.ok) return null;
    return readFeed(await r.text()).version;
  } catch {
    return null;
  }
}

/** The system this computer runs, or null on a phone or tablet (the tracker is for computers). */
export const trackerOsFor = feedOsFor;

/** The folder the tracker's files are in (for tests and for the checks that the feed never points at GitHub). */
export const trackerFeedFolder = () => feedUrl('tracker');

/** Start the download without leaving the page. 'not-ready' when the feed has no installer for this system yet. */
export async function startTrackerDownload(os: TrackerOs): Promise<'started' | 'not-ready'> {
  const d = await feedDownload('tracker', os);
  if (!d) return 'not-ready';
  saveFromUrl(d.url, d.file);
  return 'started';
}
