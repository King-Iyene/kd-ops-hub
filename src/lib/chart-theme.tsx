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
        <p className="text-2xs font-medium text-popover-foreground mb-1.5">
          {label}
        </p>
      )}
      <div className="space-y-1">
        {visible.map((entry, i) => (
          <div key={i} className="flex items-center gap-2 text-2xs">
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
