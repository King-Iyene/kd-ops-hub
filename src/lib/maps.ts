export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined ?? '';

// Round to 4 decimal places for cache key (~11 m precision).
const geocodeCache = new Map<string, string>();

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (geocodeCache.has(key)) return geocodeCache.get(key)!;
  if (!GOOGLE_MAPS_API_KEY) return null;
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}&language=en&result_type=street_address|route|sublocality|locality`,
    );
    if (!res.ok) throw new Error('geocode_fail');
    const json = await res.json();
    const address: string | undefined = json.results?.[0]?.formatted_address;
    if (!address) return null;
    geocodeCache.set(key, address);
    return address;
  } catch {
    return null;
  }
}

// Google Maps options shared across the app
export const MAP_OPTIONS: google.maps.MapOptions = {
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: false,
  zoomControlOptions: { position: 9 }, // RIGHT_CENTER
  gestureHandling: 'cooperative',
  clickableIcons: false,
};
