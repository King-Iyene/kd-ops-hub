import { seasonFor, skyState, type SeasonMode, type TimeMode } from './world/sky';
import { phaseOf, seasonBadge } from './SkyPanel';
import { inDesktopApp } from './desktopApp';

/** The small sky pill on the map: the hour and the Nigerian season, the same for everyone. Admins can click it to change the sky. */
export function SkyControl({ timeMode, seasonMode, canEdit, onOpen }: {
  timeMode: TimeMode;
  seasonMode: SeasonMode;
  canEdit: boolean;
  onOpen: () => void;
}) {
  const now = Date.now();
  const ph = phaseOf(skyState(timeMode, now).hour);
  const sb = seasonBadge(seasonFor(seasonMode, now));
  const manual = timeMode !== 'auto' || seasonMode !== 'auto';
  const inner = (
    <>
      {ph.icon}<span>{ph.label}</span>
      <span className="h-3 w-px bg-white/15" />
      {sb.icon}<span>{sb.label}</span>
      {manual && <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-500">Set by admin</span>}
    </>
  );
  const cls = (inDesktopApp() ? 'ko absolute right-[4.5rem] top-2 z-10 h-10' : 'ko absolute right-3 top-3 z-10') + ' flex max-w-[calc(100%-1.5rem)] items-center gap-2 overflow-hidden whitespace-nowrap rounded-full border border-white/[0.1] bg-background/70 px-3 py-1.5 text-xs font-semibold shadow-lg backdrop-blur-md';
  return canEdit
    ? <button type="button" onClick={onOpen} title="Change the sky for everyone" aria-label="Sky: change for everyone" className={cls + ' transition hover:bg-background'}>{inner}</button>
    : <div className={cls} title="The sky is set for the whole office">{inner}</div>;
}
