import { CloudRain, CloudSun, Moon, Sun, Sunrise, Sunset, Wind } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SEASON_MODES, TIME_MODES, seasonFor, skyState, type SeasonMode, type TimeMode } from './world/sky';

function phase(hour: number): { label: string; icon: JSX.Element } {
  if (hour < 5.5 || hour >= 19.5) return { label: 'Night', icon: <Moon className="h-4 w-4" /> };
  if (hour < 7) return { label: 'Dawn', icon: <Sunrise className="h-4 w-4" /> };
  if (hour < 12) return { label: 'Morning', icon: <Sun className="h-4 w-4" /> };
  if (hour < 17.5) return { label: 'Afternoon', icon: <Sun className="h-4 w-4" /> };
  return { label: 'Evening', icon: <Sunset className="h-4 w-4" /> };
}

/**
 * The sky control, always on the map: shows the time of day and season right now, and lets you leave both on automatic
 * (Lagos time and the Nigerian calendar) or choose them yourself.
 */
export function SkyControl({ timeMode, seasonMode, onTime, onSeason }: {
  timeMode: TimeMode;
  seasonMode: SeasonMode;
  onTime: (m: TimeMode) => void;
  onSeason: (m: SeasonMode) => void;
}) {
  const now = Date.now();
  const sky = skyState(timeMode, now);
  const season = seasonFor(seasonMode, now);
  const ph = phase(sky.hour);
  const seasonIcon = season === 'rainy' ? <CloudRain className="h-4 w-4" /> : season === 'harmattan' ? <Wind className="h-4 w-4" /> : <CloudSun className="h-4 w-4" />;
  const seasonLabel = season === 'rainy' ? 'Rainy' : season === 'harmattan' ? 'Harmattan' : 'Clear';
  const manual = timeMode !== 'auto' || seasonMode !== 'auto';

  const group = <T extends string>(title: string, items: { id: T; label: string }[], value: T, pick: (v: T) => void) => (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((m) => (
          <button key={m.id} type="button" onClick={() => pick(m.id)} aria-pressed={value === m.id}
            className={`rounded-full border px-2.5 py-1 text-xs transition ${value === m.id ? 'border-primary bg-primary/10 font-medium text-primary' : 'hover:bg-muted'}`}>
            {m.id === 'auto' ? 'Auto' : m.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Time of day and season"
          className="absolute right-3 top-3 z-10 flex items-center gap-2 rounded-full border border-white/10 bg-background/80 px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur-md transition hover:bg-background">
          {ph.icon}<span>{ph.label}</span>
          <span className="h-3 w-px bg-border" />
          {seasonIcon}<span>{seasonLabel}</span>
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${manual ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'}`}>{manual ? 'Manual' : 'Auto'}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3.5 rounded-2xl border-white/10 bg-popover/90 backdrop-blur-xl">
        {group('Time of day', TIME_MODES, timeMode, onTime)}
        {group('Season', SEASON_MODES, seasonMode, onSeason)}
        <p className="text-xs text-muted-foreground">
          Auto follows Lagos time (dawn, sunset and night) and the Nigerian calendar: Harmattan from late November to February, rains from April to October.
          This is for your screen only.
        </p>
      </PopoverContent>
    </Popover>
  );
}
