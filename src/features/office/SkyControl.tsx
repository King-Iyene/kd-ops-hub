import { seasonFor, skyState, type SeasonMode, type TimeMode } from './world/sky';
import { phaseOf, seasonBadge } from './SkyPanel';
import type { Weather } from './world/weather';

/** The small sky pill on the map: the hour, the season and the temperature, the same for everyone. Admins can click it to change the sky. */
export function SkyControl({ timeMode, seasonMode, weather, canEdit, onOpen }: {
  timeMode: TimeMode;
  seasonMode: SeasonMode;
  weather: Weather | null;
  place: string;
  canEdit: boolean;
  onOpen: () => void;
}) {
  const now = Date.now();
  const ph = phaseOf(skyState(timeMode, now).hour);
  const sb = seasonBadge(seasonFor(seasonMode, now, weather));
  const manual = timeMode !== 'auto' || seasonMode !== 'auto';
  const inner = (
    <>
      {ph.icon}<span>{ph.label}</span>
      <span className="h-3 w-px bg-white/15" />
      {sb.icon}<span>{sb.label}</span>
      {weather && <><span className="h-3 w-px bg-white/15" /><span>{weather.temp}°C</span></>}
      {manual && <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-500">Set by admin</span>}
    </>
  );
  const cls = 'ko absolute right-3 top-3 z-10 flex items-center gap-2 rounded-full border border-white/[0.1] bg-background/70 px-3 py-1.5 text-xs font-semibold shadow-lg backdrop-blur-md';
  return canEdit
    ? <button type="button" onClick={onOpen} title="Change the sky for everyone" aria-label="Sky: change for everyone" className={cls + ' transition hover:bg-background'}>{inner}</button>
    : <div className={cls} title="The sky is set for the whole office">{inner}</div>;
}
