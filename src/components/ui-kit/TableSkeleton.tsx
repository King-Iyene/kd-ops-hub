interface Props {
  rows?: number;
  cols?: number;
}

// Per-column widths cycle so each column looks unique (not a uniform wall of bars).
const WIDTH_PATTERNS = [
  ['w-24', 'w-36', 'w-28', 'w-20', 'w-16'],
  ['w-20', 'w-32', 'flex-1', 'w-24', 'w-14'],
  ['w-28', 'w-40', 'w-32', 'w-16', 'w-18'],
];

export function TableSkeleton({ rows = 6, cols = 5 }: Props) {
  return (
    <div role="status" aria-label="Loading data" aria-live="polite" className="divide-y divide-border/30">
      {Array.from({ length: rows }).map((_, r) => {
        const pattern = WIDTH_PATTERNS[r % WIDTH_PATTERNS.length];
        return (
          <div key={r} className="flex items-center gap-4 px-4 py-3.5">
            {Array.from({ length: cols }).map((_, c) => {
              const w = c === 2 ? 'flex-1' : (pattern[c] ?? 'w-20');
              // Alternate height slightly for a more natural page skeleton
              const h = c === 0 ? 'h-4' : c === 1 ? 'h-3.5' : 'h-3';
              return (
                <div
                  key={c}
                  className={`${h} rounded-full kd-skeleton ${w}`}
                  style={{ animationDelay: `${r * 60 + c * 25}ms` }}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
