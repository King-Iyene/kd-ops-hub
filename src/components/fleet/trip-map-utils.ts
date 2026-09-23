// Utility exports extracted from TripMapModal.tsx
// to satisfy react-refresh/only-export-components.

export function isCoordString(s: string) {
  return /[°]\s*[NSns]/.test(s);
}

// Module-level cache — each unique coordinate string is geocoded at most once per session.
export const geocodeResultCache = new Map<string, string>();
