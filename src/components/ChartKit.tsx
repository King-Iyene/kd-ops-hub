/**
 * Shared chart styling — gradient defs, glass tooltip.
 * Drop ChartGradients once inside any Recharts container, then reference
 * the gradients via `url(#kd-grad-cyan)` etc. in fill / stroke props.
 */

import { chartTheme } from './chart-kit-constants';

/** Single source of truth for every gradient referenced by id. */
export function ChartGradients() {
  return (
    <defs>
      {/* Vertical area / bar gradients — top-bright → bottom-fade */}
      <linearGradient id="kd-grad-primary" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor={chartTheme.primary} stopOpacity={0.95} />
        <stop offset="100%" stopColor={chartTheme.primary} stopOpacity={0.15} />
      </linearGradient>

      <linearGradient id="kd-grad-cyan" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor={chartTheme.cyan} stopOpacity={0.85} />
        <stop offset="100%" stopColor={chartTheme.cyan} stopOpacity={0.1} />
      </linearGradient>

      <linearGradient id="kd-grad-gold" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor={chartTheme.gold} stopOpacity={0.95} />
        <stop offset="100%" stopColor={chartTheme.gold} stopOpacity={0.2} />
      </linearGradient>

      <linearGradient id="kd-grad-success" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor={chartTheme.success} stopOpacity={0.9} />
        <stop offset="100%" stopColor={chartTheme.success} stopOpacity={0.15} />
      </linearGradient>

      <linearGradient id="kd-grad-warning" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor={chartTheme.warning} stopOpacity={0.95} />
        <stop offset="100%" stopColor={chartTheme.warning} stopOpacity={0.2} />
      </linearGradient>

      <linearGradient id="kd-grad-danger" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor={chartTheme.danger} stopOpacity={0.9} />
        <stop offset="100%" stopColor={chartTheme.danger} stopOpacity={0.15} />
      </linearGradient>

      <linearGradient id="kd-grad-violet" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor={chartTheme.violet} stopOpacity={0.9} />
        <stop offset="100%" stopColor={chartTheme.violet} stopOpacity={0.15} />
      </linearGradient>

      {/* Donut sweep — radial brand glow */}
      <radialGradient id="kd-grad-donut" cx="50%" cy="50%" r="50%">
        <stop offset="0%"  stopColor={chartTheme.cyan} stopOpacity={0.4} />
        <stop offset="60%" stopColor={chartTheme.primary} stopOpacity={1} />
        <stop offset="100%" stopColor={chartTheme.primary} stopOpacity={0.85} />
      </radialGradient>

      {/* Subtle glow filter for line chart strokes */}
      <filter id="kd-line-glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="2" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}

/** Glass tooltip body for Recharts. Pass via <Tooltip content={<GlassTooltip />} />. */
export function GlassTooltip(props: any) {
  const { active, payload, label, formatter, labelFormatter } = props;
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="kd-toolbar-glass rounded-lg px-3 py-2 text-xs shadow-xl min-w-[140px]">
      {label !== undefined && (
        <p className="font-semibold text-foreground mb-1.5 capitalize">
          {labelFormatter ? labelFormatter(label) : label}
        </p>
      )}
      <div className="space-y-1">
        {payload.map((entry: any, i: number) => {
          const value = formatter ? formatter(entry.value, entry.name) : entry.value;
          const display = Array.isArray(value) ? value[0] : value;
          return (
            <div key={i} className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ background: entry.color || entry.fill || chartTheme.primary }}
              />
              <span className="text-muted-foreground capitalize">{entry.name}</span>
              <span className="ml-auto font-semibold text-foreground tabular-nums">{display}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
