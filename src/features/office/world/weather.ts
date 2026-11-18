/**
 * Real weather for the office's sky. Open-Meteo is a free weather service that needs no account or key.
 * When the sky is on Auto, rain falls in the office when it is really raining in the chosen city.
 */
export interface Place { id: string; /** the state (or FCT) */ state: string; /** the city we read the weather for */ name: string; lat: number; lon: number }

/** "Rivers · Port Harcourt", or just the name when the city and state are the same. */
export function placeLabel(p: Place): string {
  return p.state === p.name ? p.name : `${p.state} · ${p.name}`;
}

/** All 36 states and the FCT (each at its capital, which is where the weather is read), in order, plus Warri. */
export const PLACES: Place[] = [
  { id: 'abia', state: 'Abia', name: 'Umuahia', lat: 5.532, lon: 7.486 },
  { id: 'adamawa', state: 'Adamawa', name: 'Yola', lat: 9.2035, lon: 12.4954 },
  { id: 'akwaibom', state: 'Akwa Ibom', name: 'Uyo', lat: 5.0377, lon: 7.9128 },
  { id: 'anambra', state: 'Anambra', name: 'Awka', lat: 6.21, lon: 7.07 },
  { id: 'bauchi', state: 'Bauchi', name: 'Bauchi', lat: 10.3158, lon: 9.8442 },
  { id: 'bayelsa', state: 'Bayelsa', name: 'Yenagoa', lat: 4.9247, lon: 6.2642 },
  { id: 'benue', state: 'Benue', name: 'Makurdi', lat: 7.7337, lon: 8.5214 },
  { id: 'borno', state: 'Borno', name: 'Maiduguri', lat: 11.8333, lon: 13.15 },
  { id: 'crossriver', state: 'Cross River', name: 'Calabar', lat: 4.9757, lon: 8.3417 },
  { id: 'delta', state: 'Delta', name: 'Asaba', lat: 6.2, lon: 6.7333 },
  { id: 'ebonyi', state: 'Ebonyi', name: 'Abakaliki', lat: 6.3249, lon: 8.1137 },
  { id: 'edo', state: 'Edo', name: 'Benin City', lat: 6.335, lon: 5.6037 },
  { id: 'ekiti', state: 'Ekiti', name: 'Ado-Ekiti', lat: 7.6211, lon: 5.2214 },
  { id: 'enugu', state: 'Enugu', name: 'Enugu', lat: 6.4584, lon: 7.5464 },
  { id: 'abuja', state: 'FCT', name: 'Abuja', lat: 9.0765, lon: 7.3986 },
  { id: 'gombe', state: 'Gombe', name: 'Gombe', lat: 10.2897, lon: 11.1673 },
  { id: 'imo', state: 'Imo', name: 'Owerri', lat: 5.485, lon: 7.035 },
  { id: 'jigawa', state: 'Jigawa', name: 'Dutse', lat: 11.7561, lon: 9.3389 },
  { id: 'kaduna', state: 'Kaduna', name: 'Kaduna', lat: 10.5105, lon: 7.4165 },
  { id: 'kano', state: 'Kano', name: 'Kano', lat: 12.0022, lon: 8.5919 },
  { id: 'katsina', state: 'Katsina', name: 'Katsina', lat: 12.9908, lon: 7.6018 },
  { id: 'kebbi', state: 'Kebbi', name: 'Birnin Kebbi', lat: 12.4539, lon: 4.1975 },
  { id: 'kogi', state: 'Kogi', name: 'Lokoja', lat: 7.8023, lon: 6.7333 },
  { id: 'kwara', state: 'Kwara', name: 'Ilorin', lat: 8.4966, lon: 4.5421 },
  { id: 'lagos', state: 'Lagos', name: 'Lagos', lat: 6.5244, lon: 3.3792 },
  { id: 'nasarawa', state: 'Nasarawa', name: 'Lafia', lat: 8.492, lon: 8.515 },
  { id: 'niger', state: 'Niger', name: 'Minna', lat: 9.6139, lon: 6.5569 },
  { id: 'ogun', state: 'Ogun', name: 'Abeokuta', lat: 7.1475, lon: 3.3619 },
  { id: 'ondo', state: 'Ondo', name: 'Akure', lat: 7.2526, lon: 5.1931 },
  { id: 'osun', state: 'Osun', name: 'Osogbo', lat: 7.7827, lon: 4.5418 },
  { id: 'ibadan', state: 'Oyo', name: 'Ibadan', lat: 7.3775, lon: 3.947 },
  { id: 'plateau', state: 'Plateau', name: 'Jos', lat: 9.8965, lon: 8.8583 },
  { id: 'portharcourt', state: 'Rivers', name: 'Port Harcourt', lat: 4.8156, lon: 7.0498 },
  { id: 'sokoto', state: 'Sokoto', name: 'Sokoto', lat: 13.0059, lon: 5.2476 },
  { id: 'taraba', state: 'Taraba', name: 'Jalingo', lat: 8.8937, lon: 11.3596 },
  { id: 'yobe', state: 'Yobe', name: 'Damaturu', lat: 11.747, lon: 11.9608 },
  { id: 'zamfara', state: 'Zamfara', name: 'Gusau', lat: 12.1704, lon: 6.6641 },
  { id: 'warri', state: 'Delta', name: 'Warri', lat: 5.516, lon: 5.75 },
];

export const DEFAULT_PLACE = 'portharcourt';

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
