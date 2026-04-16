import { Skeleton } from '@/components/ui/skeleton';

interface Props {
  rows?: number;
  cols?: number;
}

/**
 * Lightweight skeleton placeholder for a table body. Pair with a visible
 * TableHeader so the page doesn't flash as data arrives.
 */
export function TableSkeleton({ rows = 6, cols = 5 }: Props) {
  return (
    <div className="p-4 space-y-3">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4">
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton
              key={c}
              className="h-4 flex-1"
              style={{ animationDelay: `${(r * cols + c) * 20}ms` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
