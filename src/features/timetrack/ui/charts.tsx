import { useId, type ReactNode } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

/**
 * Shared charts for the Time Tracking module, modelled on TimeCamp's reports:
 * plain, quiet, readable. Rules every chart here follows:
 *  - time is always shown as a duration ("2h 05m", "35m"), never decimal hours (0.045);
 *  - axis ticks fall on round minutes / hours;
 *  - names are written horizontally (ranked bars), never rotated;
 *  - a series of 1-2 points is drawn as columns, not as a lonely dot on a line;
 *  - no data shows a clear message instead of empty axes.
 */

export const CHART_COLORS = {
  productive: '#22c55e',
  neutral: '#94a3b8',
  unproductive: '#ef4444',
  blocked: '#b91c1c',
  idle: '#38bdf8',
  uncategorized: '#94a3b8',
  accent: '#22c55e',
} as const;

const GRID = { stroke: 'currentColor', strokeOpacity: 0.1 } as const;
const AXIS_TEXT = { fontSize: 11, fill: 'currentColor', fillOpacity: 0.65 } as const;

/** 1.75 -> "1h 45m", 0.58 -> "35m", 2 -> "2h", 0.004 -> "<1m", 0 -> "0m". */
export function fmtDuration(hours: number): string {
  const totalMin = Math.round(hours * 60);
  if (totalMin <= 0) return hours > 0 ? '<1m' : '0m';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, '0')}m`;
}

/** Round-number axis for a duration: at most ~4 intervals, in minutes below 1h-steps, hours above. */
export function durationAxis(maxHours: number) {
  const maxMin = Math.max(1, maxHours * 60);
  const steps = [1, 2, 5, 10, 15, 20, 30, 60, 120, 180, 240, 360, 480, 720, 1440];
  const step = steps.find((s) => maxMin / s <= 4) ?? 1440;
  const top = Math.ceil(maxMin / step) * step;
  const ticks: number[] = [];
  for (let m = 0; m <= top; m += step) ticks.push(m / 60);
  const inHours = step >= 60;
  return {
    ticks,
    domain: [0, top / 60] as [number, number],
    format: (v: number) => (v === 0 ? '0' : inHours ? `${Math.round(v)}h` : `${Math.round(v * 60)}m`),
  };
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

interface TipProps {
  active?: boolean;
  payload?: { payload: { name?: string; label?: string; hours?: number; value?: number; note?: string } }[];
  kind: 'duration' | 'percent';
}

function Tip({ active, payload, kind }: TipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const title = d.name ?? d.label ?? '';
  const value = kind === 'percent' ? `${Math.round(d.value ?? 0)}%` : fmtDuration(d.hours ?? 0);
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <p className="text-muted-foreground">{title}</p>
      <p className="mt-0.5 text-sm font-semibold text-foreground">{value}</p>
      {d.note && <p className="mt-0.5 text-muted-foreground">{d.note}</p>}
    </div>
  );
}

export function ChartEmpty({ children = 'Nothing tracked in this period.' }: { children?: ReactNode }) {
  return (
    <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export interface NamedHours { name: string; hours: number; color?: string; note?: string }

/** Ranked horizontal bars: the right chart for "top apps / sites / categories / projects". */
export function RankedBars({ data, color = CHART_COLORS.accent, max = 10 }: { data: NamedHours[]; color?: string; max?: number }) {
  const rows = data.filter((d) => d.hours > 0).slice(0, max);
  if (rows.length === 0) return <ChartEmpty />;
  const axis = durationAxis(Math.max(...rows.map((r) => r.hours)));
  const height = Math.max(110, rows.length * 34 + 28);
  return (
    <div className="text-foreground" style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 64, bottom: 4, left: 4 }} barCategoryGap={8}>
          <CartesianGrid horizontal={false} {...GRID} />
          <XAxis type="number" domain={axis.domain} ticks={axis.ticks} tickFormatter={axis.format} tick={AXIS_TEXT} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={150} tick={AXIS_TEXT} tickFormatter={(v: string) => truncate(v, 24)} axisLine={false} tickLine={false} interval={0} />
          <Tooltip cursor={{ fill: 'currentColor', fillOpacity: 0.05 }} content={<Tip kind="duration" />} />
          <Bar dataKey="hours" radius={[0, 4, 4, 0]} barSize={18} isAnimationActive={false}>
            {rows.map((r, i) => <Cell key={i} fill={r.color ?? color} />)}
            <LabelList dataKey="hours" position="right" formatter={(v: number) => fmtDuration(v)} style={{ fontSize: 11, fill: 'currentColor', fillOpacity: 0.85 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface LabelledHours { label: string; hours: number; color?: string; note?: string }

/** Time-ordered columns (hour of day, days): one column per bucket with a duration axis. */
export function DurationColumns({ data, color = CHART_COLORS.accent, height = 220, xInterval = 0 }: { data: LabelledHours[]; color?: string; height?: number; xInterval?: number }) {
  if (data.length === 0 || data.every((d) => d.hours <= 0)) return <ChartEmpty />;
  const axis = durationAxis(Math.max(...data.map((d) => d.hours)));
  return (
    <div className="text-foreground" style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} {...GRID} />
          <XAxis dataKey="label" tick={AXIS_TEXT} interval={xInterval} axisLine={false} tickLine={false} />
          <YAxis domain={axis.domain} ticks={axis.ticks} tickFormatter={axis.format} tick={AXIS_TEXT} width={38} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: 'currentColor', fillOpacity: 0.05 }} content={<Tip kind="duration" />} />
          <Bar dataKey="hours" radius={[3, 3, 0, 0]} maxBarSize={44} isAnimationActive={false}>
            {data.map((d, i) => <Cell key={i} fill={d.color ?? color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface TrendPoint { label: string; value: number; note?: string }

/**
 * The polished time-series line: smooth curve with a green-to-cyan gradient stroke and soft glow,
 * faded area underneath, ringed dots, a dashed hover guide and a tooltip. Values are hours
 * (kind="duration") or 0-100 (kind="percent"). Always a line, even for 1-2 points (padded so
 * the dots do not sit on the axes), and value labels appear when there are only a few points.
 */
export function TrendLine({
  data, kind = 'duration', height = 220, xInterval, color = CHART_COLORS.accent,
}: { data: TrendPoint[]; kind?: 'duration' | 'percent'; height?: number; xInterval?: number | 'preserveEnd'; color?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  if (data.length === 0 || (kind === 'duration' && data.every((d) => d.value <= 0))) return <ChartEmpty />;
  const rows = data.map((d) => ({ ...d, hours: d.value }));
  const axis = kind === 'percent'
    ? { ticks: [0, 25, 50, 75, 100], domain: [0, 100] as [number, number], format: (v: number) => `${v}%` }
    : durationAxis(Math.max(...rows.map((r) => r.value)));
  const fmt = (v: number) => (kind === 'percent' ? `${Math.round(v)}%` : fmtDuration(v));
  const few = rows.length <= 6;
  const pad = rows.length < 4 ? 48 : 16;
  const dotFill = 'hsl(var(--background))';
  return (
    <div className="text-foreground" style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 22, right: 14, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.4} />
              <stop offset="70%" stopColor={color} stopOpacity={0.08} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
            <linearGradient id={`${uid}-line`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={color} />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 5" {...GRID} />
          <XAxis dataKey="label" tick={AXIS_TEXT} axisLine={false} tickLine={false} padding={{ left: pad, right: pad }} interval={xInterval ?? 'preserveEnd'} minTickGap={20} />
          <YAxis domain={axis.domain} ticks={axis.ticks} tickFormatter={axis.format} tick={AXIS_TEXT} width={40} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ stroke: color, strokeOpacity: 0.5, strokeDasharray: '4 4' }} content={<Tip kind={kind} />} />
          <Area
            type="monotone" dataKey="value" stroke={`url(#${uid}-line)`} strokeWidth={3} fill={`url(#${uid}-fill)`}
            style={{ filter: `drop-shadow(0 3px 6px ${color}66)` }}
            dot={{ r: 3.5, fill: dotFill, stroke: color, strokeWidth: 2 }}
            activeDot={{ r: 6, fill: color, stroke: dotFill, strokeWidth: 3 }}
            animationDuration={900} animationEasing="ease-out"
          >
            {few && <LabelList dataKey="value" position="top" offset={10} formatter={fmt} style={{ fontSize: 11, fontWeight: 600, fill: 'currentColor', fillOpacity: 0.9 }} />}
          </Area>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Running total over time, drawn as the polished line. */
export function CumulativeChart({ data, height = 220 }: { data: LabelledHours[]; height?: number }) {
  return <TrendLine data={data.map((d) => ({ label: d.label, value: d.hours, note: 'Total so far' }))} height={height} />;
}

export interface LabelledPercent { label: string; value: number }

/** A 0-100% value per day, drawn as the polished line. */
export function PercentTrend({ data, height = 200 }: { data: LabelledPercent[]; height?: number }) {
  return <TrendLine data={data} kind="percent" height={height} />;
}
