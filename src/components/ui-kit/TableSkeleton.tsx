interface Props {
  rows?: number;
  cols?: number;
}

export function TableSkeleton({ rows = 6, cols = 5 }: Props) {
  const widths = ['w-24', 'w-32', 'flex-1', 'w-20', 'w-16'];

  return (
    <div role="status" aria-label="Loading data" className="divide-y divide-border/40">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3">
          {Array.from({ length: cols }).map((_, c) => (
            <div
              key={c}
              className={`h-3.5 rounded-full kd-skeleton ${c === 2 ? 'flex-1' : widths[c] ?? 'w-20'}`}
              style={{ animationDelay: `${(r * 80 + c * 30)}ms` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
