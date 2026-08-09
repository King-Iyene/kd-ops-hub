export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined ?? '';

export const MAPS_LIBRARIES: ('places' | 'geometry')[] = [];

// Round to 4 decimal places for the cache key (~11 m precision).
const geocodeCache = new Map<string, string>();

// ─── Geocoder via Maps JavaScript API (same key, no separate product enablement) ─────────────
// google.maps.Geocoder is bundled with the Maps JS API. Bolt, Uber, and similar apps use this
// class — NOT the Geocoding REST API — because it shares the key, returns POI/landmark names,
// and works without enabling a separate Cloud product.
function geocodeWithMapsApi(lat: number, lng: number): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof google === 'undefined' || !google.maps?.Geocoder) {
      resolve(null);
      return;
    }
    new google.maps.Geocoder().geocode({ location: { lat, lng } }, (results, status) => {
      if (status !== 'OK' || !results?.length) { resolve(null); return; }

      // Rank by specificity: POI/establishment first, then street, then area
      const rank = (types: string[]) =>
        types.includes('establishment') || types.includes('point_of_interest') ? 0 :
        types.includes('premise') ? 1 :
        types.includes('street_address') ? 2 :
        types.includes('route') ? 3 :
        types.includes('sublocality_level_1') || types.includes('sublocality') ? 4 :
        types.includes('neighborhood') ? 5 :
        types.includes('locality') ? 6 :
        types.includes('administrative_area_level_2') ? 7 :
        types.includes('administrative_area_level_1') ? 8 : 9;

      const best = [...results].sort((a, b) => rank(a.types) - rank(b.types))[0];
      resolve(best?.formatted_address ?? null);
    });
  });
}

// ─── Nominatim fallback (OpenStreetMap) ──────────────────────────────────────────────────────
// Free, no API key, excellent Nigerian LGA/landmark coverage. Many community-mapped POIs,
// street names, and local government area boundaries across Nigeria.
async function geocodeWithNominatim(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1&accept-language=en`,
    );
    if (!res.ok) return null;
    const data = await res.json();

    // Build a readable string: POI name (if any) + road + suburb + city + state
    const a = data.address ?? {};
    const parts: string[] = [];

    // POI / building name — most specific, shown first
    const poi = data.name || a.amenity || a.building || a.shop || a.office || a.tourism || a.leisure;
    if (poi) parts.push(poi);

    // Street
    const road = a.road || a.pedestrian || a.footway || a.path;
    if (road) parts.push(road);

    // Neighbourhood / LGA
    const sub = a.suburb || a.neighbourhood || a.quarter || a.city_district || a.county;
    if (sub) parts.push(sub);

    // City / state
    const city = a.city || a.town || a.village || a.municipality;
    if (city) parts.push(city);
    if (a.state) parts.push(a.state);
    if (a.country_code === 'ng') parts.push('Nigeria');

    if (parts.length === 0) return data.display_name ?? null;
    return parts.join(', ');
  } catch {
    return null;
  }
}

// ─── Public entry point ───────────────────────────────────────────────────────────────────────
// Priority: Maps JS Geocoder (POI-aware, uses same key as map) → Nominatim (free, OSM coverage)
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (geocodeCache.has(key)) return geocodeCache.get(key)!;

  const mapsResult = await geocodeWithMapsApi(lat, lng);
  if (mapsResult) {
    geocodeCache.set(key, mapsResult);
    return mapsResult;
  }

  const nominatimResult = await geocodeWithNominatim(lat, lng);
  if (nominatimResult) {
    geocodeCache.set(key, nominatimResult);
    return nominatimResult;
  }

  return null;
}

// ─── Shared Google Maps options ───────────────────────────────────────────────────────────────
export const MAP_OPTIONS: google.maps.MapOptions = {
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: false,
  zoomControlOptions: { position: 9 }, // RIGHT_CENTER
  gestureHandling: 'cooperative',
  clickableIcons: false,
};
