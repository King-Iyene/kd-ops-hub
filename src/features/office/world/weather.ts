/**
 * Real weather for the office's sky. Open-Meteo is a free weather service that needs no account or key.
 * When the sky is on Auto, rain falls in the office when it is really raining in the chosen city.
 */
export interface Place { id: string; name: string; lat: number; lon: number }

export const PLACES: Place[] = [
  { id: 'lagos', name: 'Lagos', lat: 6.5244, lon: 3.3792 },
  { id: 'abuja', name: 'Abuja', lat: 9.0765, lon: 7.3986 },
  { id: 'portharcourt', name: 'Port Harcourt', lat: 4.8156, lon: 7.0498 },
  { id: 'yenagoa', name: 'Yenagoa', lat: 4.9247, lon: 6.2642 },
  { id: 'warri', name: 'Warri', lat: 5.516, lon: 5.75 },
  { id: 'uyo', name: 'Uyo', lat: 5.0377, lon: 7.9128 },
  { id: 'enugu', name: 'Enugu', lat: 6.4584, lon: 7.5464 },
  { id: 'ibadan', name: 'Ibadan', lat: 7.3775, lon: 3.947 },
  { id: 'kano', name: 'Kano', lat: 12.0022, lon: 8.5919 },
];

export const DEFAULT_PLACE = 'lagos';

export interface Weather {
  temp: number;
  feels: number;
  humidity: number;
  /** km/h */
  wind: number;
  code: number;
  /** rain right now, in millimetres per hour */
  rainMm: number;
  at: number;
}

export interface Condition { label: string; raining: boolean; stormy: boolean; foggy: boolean; cloudy: boolean }

/** What a weather code from the service means. */
export function describe(code: number): Condition {
  const none = { raining: false, stormy: false, foggy: false, cloudy: false };
  if (code === 0) return { label: 'Clear sky', ...none };
  if (code === 1) return { label: 'Mostly clear', ...none };
  if (code === 2) return { label: 'Partly cloudy', ...none, cloudy: true };
  if (code === 3) return { label: 'Overcast', ...none, cloudy: true };
  if (code === 45 || code === 48) return { label: 'Foggy', ...none, foggy: true };
  if (code >= 51 && code <= 57) return { label: 'Drizzle', ...none, raining: true };
  if (code >= 61 && code <= 67) return { label: code >= 65 ? 'Heavy rain' : 'Rain', ...none, raining: true };
  if (code >= 80 && code <= 82) return { label: code === 82 ? 'Violent showers' : 'Showers', ...none, raining: true };
  if (code >= 95) return { label: 'Thunderstorm', ...none, raining: true, stormy: true };
  return { label: 'Fair', ...none };
}

/** How hard it is raining, 0 (dry) to 1 (pouring), from what the service reports. */
export function liveRainLevel(w: Weather | null): number {
  if (!w) return 0;
  const c = describe(w.code);
  if (!c.raining && w.rainMm < 0.1) return 0;
  return Math.max(0.25, Math.min(1, 0.25 + w.rainMm / 4 + (c.stormy ? 0.3 : 0)));
}

export async function fetchWeather(place: Place): Promise<Weather | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,rain,weather_code,wind_speed_10m&timezone=Africa%2FLagos`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { current?: Record<string, number> };
    const c = j.current;
    if (!c || typeof c.temperature_2m !== 'number') return null;
    return {
      temp: Math.round(c.temperature_2m),
      feels: Math.round(c.apparent_temperature ?? c.temperature_2m),
      humidity: Math.round(c.relative_humidity_2m ?? 0),
      wind: Math.round(c.wind_speed_10m ?? 0),
      code: Math.round(c.weather_code ?? 0),
      rainMm: c.rain ?? 0,
      at: Date.now(),
    };
  } catch {
    return null;
  }
}
