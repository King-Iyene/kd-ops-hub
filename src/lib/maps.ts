export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined ?? '';

// Round to 4 decimal places for cache key (~11 m precision).
const geocodeCache = new Map<string, string>();

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (geocodeCache.has(key)) return geocodeCache.get(key)!;
  if (!GOOGLE_MAPS_API_KEY) return null;
  try {
    // No result_type filter — Nigerian addresses rarely have street_address/route coverage;
    // filtering by type returns empty results for most LGAs. Take the best available result.
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}&language=en`,
    );
    if (!res.ok) throw new Error('geocode_fail');
    const json = await res.json();
    // Prefer the most specific result (street_address → locality → admin area)
    const results: { formatted_address: string; types: string[] }[] = json.results ?? [];
    const ranked = results.sort((a, b) => {
      const rank = (types: string[]) =>
        types.includes('street_address') ? 0 :
        types.includes('route') ? 1 :
        types.includes('sublocality_level_1') || types.includes('sublocality') ? 2 :
        types.includes('neighborhood') ? 3 :
        types.includes('locality') ? 4 :
        types.includes('administrative_area_level_2') ? 5 :
        types.includes('administrative_area_level_1') ? 6 : 7;
      return rank(a.types) - rank(b.types);
    });
    const address: string | undefined = ranked[0]?.formatted_address;
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
