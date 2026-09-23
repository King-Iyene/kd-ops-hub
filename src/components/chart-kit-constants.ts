/**
 * Shared chart styling constants — theme colours, palette, formatters, axis
 * tick style, and animation defaults.  Extracted from ChartKit.tsx so that
 * non-component exports don't trigger the react-refresh/only-export-components
 * lint rule.
 */

export const chartTheme = {
  primary:    '#006994',
  cyan:       '#00ECFF',
  gold:       '#D6AC50',
  success:    '#3FAE6F',
  warning:    '#F59E0B',
  danger:     '#EF4444',
  violet:     '#8B5CF6',
  muted:      '#E2E8F0',
  // axis + gridLine use translucent slate so they read correctly in BOTH light
  // and dark mode without a per-chart theme switch. Solid #E2E8F0 gridlines
  // glared white on dark surfaces; slate-400 at low alpha is subtle on light
  // and soft on dark. (Independent of the time-of-day --tod-* system.)
  axis:       'rgba(100, 116, 139, 0.85)',
  gridLine:   'rgba(148, 163, 184, 0.22)',
};

/** Ordered, on-brand palette for categorical charts (pie/donut cells, multi-
 *  series bars) that need more than the 3 named brand colors. Cycles via
 *  `chartPalette[i % chartPalette.length]` for any N categories. */
export const chartPalette = [
  chartTheme.primary,
  chartTheme.cyan,
  chartTheme.gold,
  chartTheme.violet,
  chartTheme.success,
  chartTheme.warning,
  chartTheme.danger,
];

/** Compact Naira formatter for chart axis ticks — auto-scales K/M. */
export function fmtNairaTick(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `₦${(n / 1_000).toFixed(0)}k`;
  return `₦${n.toFixed(0)}`;
}

/** Shared axis tick style. Pass to XAxis/YAxis tick prop. */
export const axisTick = {
  fontSize: 11,
  fill: chartTheme.axis,
  fontFamily: 'Inter, sans-serif',
};

/** Animation defaults for charts — pass via animationDuration, animationBegin. */
export const chartAnim = {
  animationBegin: 0,
  animationDuration: 900,
  animationEasing: 'ease-out' as const,
};
