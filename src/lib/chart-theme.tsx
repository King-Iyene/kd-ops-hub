/**
 * Shared chart design system — validated palette, custom tooltip, and
 * chart styling constants. All chart tabs import from here so the
 * visual language is consistent across the Finance dashboard.
 *
 * Palette: CVD-validated (adjacent ΔE ≥ 8 OKLab ×100) in both modes.
 * Gridlines: solid hairline, never dashed.
 * Tooltips: styled overlay with line-key indicators.
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

/**
 * Custom Recharts tooltip — styled overlay with line-key indicators.
 * Pass as `<ReTooltip content={<ChartTooltip valueFormatter={formatNaira} />} />`
 */
export function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter = (v: number) => v.toLocaleString(),
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string; dataKey?: string }>;
  label?: string | number;
  valueFormatter?: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const visible = payload.filter(
    (e) => e.value != null && e.dataKey !== 'base',
  );
  if (visible.length === 0) return null;

  return (
    <div className="rounded-lg border bg-popover/95 backdrop-blur-sm px-3 py-2.5 shadow-lg ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
      {label != null && (
        <p className="text-[11px] font-medium text-popover-foreground mb-1.5">
          {label}
        </p>
      )}
      <div className="space-y-1">
        {visible.map((entry, i) => (
          <div key={i} className="flex items-center gap-2 text-[11px]">
            <span
              className="w-2 h-[2px] rounded-sm shrink-0"
              style={{ background: entry.color }}
            />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="ml-auto font-semibold tabular-nums text-popover-foreground pl-3">
              {valueFormatter(typeof entry.value === 'number' ? entry.value : 0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
