import { CloudRain, CloudSun, Droplets, MapPin, Moon, Sun, Sunrise, Sunset, Thermometer, Wind } from 'lucide-react';
import { SEASON_MODES, TIME_MODES, seasonFor, skyState, type SeasonMode, type TimeMode } from './world/sky';
import { PLACES, describe, type Weather } from './world/weather';
import { LABEL } from './ui';

export function phaseOf(hour: number): { label: string; icon: JSX.Element } {
  if (hour < 5.5 || hour >= 19.5) return { label: 'Night', icon: <Moon className="h-3.5 w-3.5" /> };
  if (hour < 7) return { label: 'Dawn', icon: <Sunrise className="h-3.5 w-3.5" /> };
  if (hour < 12) return { label: 'Morning', icon: <Sun className="h-3.5 w-3.5" /> };
  if (hour < 17.5) return { label: 'Afternoon', icon: <Sun className="h-3.5 w-3.5" /> };
  return { label: 'Evening', icon: <Sunset className="h-3.5 w-3.5" /> };
}

export function seasonBadge(season: ReturnType<typeof seasonFor>): { label: string; icon: JSX.Element } {
  if (season === 'rainy') return { label: 'Rainy', icon: <CloudRain className="h-3.5 w-3.5" /> };
  if (season === 'harmattan') return { label: 'Harmattan', icon: <Wind className="h-3.5 w-3.5" /> };
  return { label: 'Clear', icon: <CloudSun className="h-3.5 w-3.5" /> };
}

export interface SkyPanelProps {
  timeMode: TimeMode;
  seasonMode: SeasonMode;
  onTime: (m: TimeMode) => void;
  onSeason: (m: SeasonMode) => void;
}

/** Live weather for a place, with a place picker. */
export function WeatherCard({ weather, place, onPlace }: { weather: Weather | null; place: string; onPlace: (id: string) => void }) {
  const cond = weather ? describe(weather.code) : null;
  const city = PLACES.find((x) => x.id === place)?.name ?? 'Lagos';
  void city;
  return (
    <div className="rounded-2xl bg-gradient-to-br from-sky-500/15 via-white/[0.03] to-white/[0.02] p-3.5 ring-1 ring-white/[0.07]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-[11.5px] font-semibold text-muted-foreground"><MapPin className="h-3 w-3" />{city}</p>
          <p className="mt-0.5 text-3xl font-extrabold leading-none tracking-tight">{weather ? `${weather.temp}°` : '--'}<span className="ml-0.5 text-base font-semibold text-muted-foreground">C</span></p>
          <p className="mt-1 text-[12.5px] font-semibold">{cond ? cond.label : 'Weather unavailable'}</p>
        </div>
        <div className="space-y-1 text-right text-[11.5px] text-muted-foreground">
          {weather && <p className="flex items-center justify-end gap-1"><Thermometer className="h-3 w-3" />Feels {weather.feels}°</p>}
          {weather && <p className="flex items-center justify-end gap-1"><Droplets className="h-3 w-3" />{weather.humidity}%</p>}
          {weather && <p className="flex items-center justify-end gap-1"><Wind className="h-3 w-3" />{weather.wind} km/h</p>}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <select value={place} onChange={(e) => onPlace(e.target.value)} aria-label="Weather location" className="h-7 min-w-0 flex-1 rounded-lg bg-white/[0.06] px-2 text-xs font-semibold outline-none ring-1 ring-white/[0.07] focus:ring-primary/60">
          {PLACES.map((x) => <option key={x.id} value={x.id} className="bg-popover">{x.name}</option>)}
        </select>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${weather ? 'bg-emerald-500/15 text-emerald-500' : 'bg-white/10 text-muted-foreground'}`}>{weather ? 'Live' : 'Offline'}</span>
      </div>
    </div>
  );
}

/** The sky controls (admins, for the whole office): live weather, the hour, the season, and the office sounds. Used by the map pill and the main panel. */
export function SkyPanel(p: SkyPanelProps) {
  const now = Date.now();
  const sky = skyState(p.timeMode, now);
  const season = seasonFor(p.seasonMode, now);

  const seg = <T extends string>(items: { id: T; label: string }[], value: T, pick: (v: T) => void) => (
    <div className="flex flex-wrap gap-1 rounded-xl bg-white/[0.05] p-1 ring-1 ring-white/[0.06]">
      {items.map((m) => (
        <button key={m.id} type="button" onClick={() => pick(m.id)} aria-pressed={value === m.id}
          className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${value === m.id ? 'bg-white/[0.14] text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
          {m.id === 'auto' ? 'Auto' : m.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <p className={`${LABEL} mb-1.5`}>Time of day · now {phaseOf(sky.hour).label}</p>
        {seg(TIME_MODES, p.timeMode, p.onTime)}
      </div>
      <div>
        <p className={`${LABEL} mb-1.5`}>Season · now {seasonBadge(season).label}</p>
        {seg(SEASON_MODES, p.seasonMode, p.onSeason)}
      </div>

      <p className="border-t border-white/[0.07] pt-3 text-[11.5px] leading-snug text-muted-foreground">
        This is the sky for the whole office, so everyone sees the same. Auto follows Lagos time and the Nigerian seasons: Harmattan from late November to February, hot and dry in March, the rains from April to October.
      </p>
    </div>
  );
}
