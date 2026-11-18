import { Volume2, VolumeX } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { seasonFor, skyState } from './world/sky';
import { SkyPanel, phaseOf, seasonBadge, type SkyPanelProps } from './SkyPanel';
import { SURFACE } from './ui';

/** The small sky pill on the map: the hour, the season, the temperature and whether it is on Auto. Click it for the full panel. */
export function SkyControl(p: SkyPanelProps) {
  const now = Date.now();
  const sky = skyState(p.timeMode, now);
  const season = seasonFor(p.seasonMode, now, p.weather);
  const ph = phaseOf(sky.hour);
  const sb = seasonBadge(season);
  const manual = p.timeMode !== 'auto' || p.seasonMode !== 'auto';
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Weather, time of day, season and sound"
          className="ko absolute right-3 top-3 z-10 flex items-center gap-2 rounded-full border border-white/[0.1] bg-background/80 py-1.5 pl-3 pr-2 text-xs font-semibold shadow-lg backdrop-blur-md transition hover:bg-background">
          {ph.icon}<span>{ph.label}</span>
          <span className="h-3 w-px bg-white/15" />
          {sb.icon}<span>{sb.label}</span>
          {p.weather && <><span className="h-3 w-px bg-white/15" /><span>{p.weather.temp}°C</span></>}
          <span className="h-3 w-px bg-white/15" />
          {p.sound ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />}
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${manual ? 'bg-amber-500/20 text-amber-500' : 'bg-emerald-500/15 text-emerald-500'}`}>{manual ? 'Manual' : 'Auto'}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className={`ko ${SURFACE} w-[24rem] max-w-[calc(100vw-1rem)] p-4`}>
        <SkyPanel {...p} />
      </PopoverContent>
    </Popover>
  );
}
