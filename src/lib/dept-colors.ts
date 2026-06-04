/**
 * Deterministic colour from a department name. Same name → same colour, every
 * time, on every page, without any DB column or per-department config. Hue is
 * derived from a stable string hash; saturation / lightness are tuned so the
 * resulting CSS works on both light and dark backgrounds with adequate
 * contrast for a small badge.
 *
 * Usage: <span style={deptBadgeStyle(name)}>{name}</span>
 */

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Hue in [0, 360). Deterministic for a given name. */
export function deptHue(name: string): number {
  if (!name) return 0;
  return hashString(name.toLowerCase()) % 360;
}

/** Inline-style object suitable for spreading into a badge / chip element.
 *  Translucent backgrounds + medium-saturation text keep the chip legible on
 *  both light card surfaces and the dark-mode equivalents without needing two
 *  separate styles per theme. */
export function deptBadgeStyle(name: string): React.CSSProperties {
  if (!name) return {};
  const h = deptHue(name);
  return {
    backgroundColor: `hsl(${h} 75% 50% / 0.15)`,
    color:           `hsl(${h} 60% 42%)`,
    borderColor:     `hsl(${h} 60% 50% / 0.35)`,
    borderWidth: 1,
    borderStyle: 'solid',
  };
}

/** Background-only style — for a small dot leading a department name. */
export function deptDotStyle(name: string): React.CSSProperties {
  if (!name) return { backgroundColor: 'var(--muted)' };
  const h = deptHue(name);
  return { backgroundColor: `hsl(${h} 70% 55%)` };
}
