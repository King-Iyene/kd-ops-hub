import { CloudRain, CloudSun, Droplets, MapPin, Moon, Sun, Sunrise, Sunset, Thermometer, Volume2, VolumeX, Wind } from 'lucide-react';
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
  sound: boolean;
  onSound: () => void;
  volume: number;
  onVolume: (v: number) => void;
  weather: Weather | null;
  place: string;
  onPlace: (id: string) => void;
}

/** The sky and sound controls: live weather, the hour, the season, and the office sounds. Used by the map pill and the main panel. */
export function SkyPanel(p: SkyPanelProps) {
  const now = Date.now();
  const sky = skyState(p.timeMode, now);
  const season = seasonFor(p.seasonMode, now, p.weather);
  const cond = p.weather ? describe(p.weather.code) : null;
  const city = PLACES.find((x) => x.id === p.place)?.name ?? 'Lagos';

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
      {/* live weather */}
      <div className="rounded-2xl bg-gradient-to-br from-sky-500/15 via-white/[0.03] to-white/[0.02] p-3.5 ring-1 ring-white/[0.07]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1 text-[11.5px] font-semibold text-muted-foreground"><MapPin className="h-3 w-3" />{city}</p>
            <p className="mt-0.5 text-3xl font-extrabold leading-none tracking-tight">{p.weather ? `${p.weather.temp}°` : '--'}<span className="ml-0.5 text-base font-semibold text-muted-foreground">C</span></p>
            <p className="mt-1 text-[12.5px] font-semibold">{cond ? cond.label : 'Weather unavailable'}</p>
          </div>
          <div className="space-y-1 text-right text-[11.5px] text-muted-foreground">
            {p.weather && <p className="flex items-center justify-end gap-1"><Thermometer className="h-3 w-3" />Feels {p.weather.feels}°</p>}
            {p.weather && <p className="flex items-center justify-end gap-1"><Droplets className="h-3 w-3" />{p.weather.humidity}%</p>}
            {p.weather && <p className="flex items-center justify-end gap-1"><Wind className="h-3 w-3" />{p.weather.wind} km/h</p>}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <select value={p.place} onChange={(e) => p.onPlace(e.target.value)} aria-label="Weather location" className="h-7 min-w-0 flex-1 rounded-lg bg-white/[0.06] px-2 text-xs font-semibold outline-none ring-1 ring-white/[0.07] focus:ring-primary/60">
            {PLACES.map((x) => <option key={x.id} value={x.id} className="bg-popover">{x.name}</option>)}
          </select>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${p.weather ? 'bg-emerald-500/15 text-emerald-500' : 'bg-white/10 text-muted-foreground'}`}>{p.weather ? 'Live' : 'Offline'}</span>
        </div>
      </div>

      <div>
        <p className={`${LABEL} mb-1.5`}>Time of day · now {phaseOf(sky.hour).label}</p>
        {seg(TIME_MODES, p.timeMode, p.onTime)}
      </div>
      <div>
        <p className={`${LABEL} mb-1.5`}>Season · now {seasonBadge(season).label}</p>
        {seg(SEASON_MODES, p.seasonMode, p.onSeason)}
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <p className={LABEL}>Office sounds</p>
          <button type="button" role="switch" aria-checked={p.sound} onClick={p.onSound} className={`relative h-5 w-9 rounded-full transition-colors ${p.sound ? 'bg-primary' : 'bg-white/15'}`}>
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${p.sound ? 'left-[1.15rem]' : 'left-0.5'}`} />
          </button>
        </div>
        <div className={`flex items-center gap-2.5 ${p.sound ? '' : 'pointer-events-none opacity-40'}`}>
          <VolumeX className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input type="range" min={0} max={100} value={Math.round(p.volume * 100)} onChange={(e) => p.onVolume(Number(e.target.value) / 100)} aria-label="Volume" className="h-1 w-full cursor-pointer accent-primary" />
          <Volume2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </div>
        <p className="mt-1.5 text-[11.5px] leading-snug text-muted-foreground">Water, fire, piano, pets, footsteps, rain and wind.</p>
      </div>

      <p className="border-t border-white/[0.07] pt-3 text-[11.5px] leading-snug text-muted-foreground">
        On Auto, rain falls in the office when it is really raining in {city}; otherwise it follows the Nigerian calendar (Harmattan from late November to February). Only your own screen changes.
      </p>
    </div>
  );
}
