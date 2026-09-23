/**
 * Shared chart design system constants — validated palette, formatters, and
 * chart styling.  Extracted from chart-theme.tsx so that non-component exports
 * don't trigger the react-refresh/only-export-components lint rule.
 */

/** Validated categorical palette (8 hues, adjacent CVD-safe in both modes). */
export const SERIES = [
  '#2a78d6', // blue
  '#eb6834', // orange
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#e87ba4', // magenta
  '#008300', // green
  '#4a3aa7', // violet
  '#e34948', // red
] as const;

/** Sequential blue steps (light → dark) for magnitude / stacked same-measure. */
export const SEQ_BLUE = ['#9ec5f4', '#6da7ec', '#2a78d6'] as const;

/** Shared CartesianGrid props — solid hairline, horizontal only. */
export const GRID = {
  stroke: 'currentColor',
  strokeOpacity: 0.07,
  vertical: false,
} as const;

/** Shared axis tick styling. */
export const AXIS_TICK = { fontSize: 11, tickLine: false, axisLine: false } as const;

/** Naira-million tick formatter for Y axes. */
export function fmtMillions(v: number): string {
  return `₦${(v / 1_000_000).toFixed(1)}M`;
}

/** Compact Naira formatter for chart labels. */
export function fmtCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `₦${(n / 1_000).toFixed(0)}K`;
  return `₦${n.toFixed(0)}`;
}
