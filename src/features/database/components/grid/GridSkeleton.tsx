import React from 'react';

const SKELETON_ROWS = 14;
const SKELETON_COLS = 6;
// Same measurements as the real grid, so the skeleton turns into the grid without anything shifting.
const ROW_NUMBER_WIDTH = 48;
const HEADER_HEIGHT = 36;
const DEFAULT_COL_WIDTH = 180;

interface SkeletonField {
  id: string;
  name: string;
  width?: number;
}

/**
 * The grid's frame while rows load. When the columns are already known (from
 * the cache, or the same request that carried the views) their real names and
 * widths are drawn, with placeholder bars where the values will go; otherwise a
 * generic set of columns. Nothing here is random, so a re-render never makes it
 * flicker.
 */
export function GridSkeleton({ rowHeight = 44, fields }: { rowHeight?: number; fields?: SkeletonField[] }) {
  const columns: SkeletonField[] =
    fields && fields.length > 0
      ? fields
      : Array.from({ length: SKELETON_COLS }, (_, i) => ({ id: `c${i}`, name: '', width: DEFAULT_COL_WIDTH }));
  const named = !!fields && fields.length > 0;

  return (
    <div className="flex flex-col h-full overflow-hidden animate-in fade-in duration-200" role="status" aria-label="Loading rows">
      {/* Header */}
      <div
        className="flex shrink-0 border-b border-[#CCCCCC] dark:border-[hsl(220,15%,32%)] bg-[#F5F5F5] dark:bg-[hsl(220,18%,13%)]"
        style={{ height: HEADER_HEIGHT }}
      >
        <div
          className="shrink-0 border-r border-[#E5E5E5] dark:border-[hsl(220,15%,25%)]"
          style={{ width: ROW_NUMBER_WIDTH, minWidth: ROW_NUMBER_WIDTH }}
        />
        {columns.map((col, i) => (
          <div
            key={col.id}
            className="shrink-0 flex items-center px-3 border-r border-[#E5E5E5] dark:border-[hsl(220,15%,25%)]"
            style={{ width: col.width || DEFAULT_COL_WIDTH, minWidth: col.width || DEFAULT_COL_WIDTH }}
          >
            {named ? (
              <span className="truncate text-[13px] font-medium text-[#444] dark:text-[hsl(210,18%,78%)]">{col.name}</span>
            ) : (
              <div
                className="h-3 rounded bg-[#E5E5E5] dark:bg-[hsl(220,20%,18%)] skeleton-pulse"
                style={{ width: 60 + ((i * 17) % 40) }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Row skeletons */}
      {Array.from({ length: SKELETON_ROWS }).map((_, rowIdx) => (
        <div
          key={rowIdx}
          className="flex shrink-0 border-b border-[#E5E5E5] dark:border-[hsl(220,15%,25%)]"
          style={{ height: rowHeight }}
        >
          <div
            className="shrink-0 flex items-center justify-center border-r border-[#E5E5E5] dark:border-[hsl(220,15%,25%)] bg-[#F5F5F5] dark:bg-[hsl(220,18%,13%)]"
            style={{ width: ROW_NUMBER_WIDTH, minWidth: ROW_NUMBER_WIDTH }}
          >
            <div className="h-3 w-4 rounded bg-[#E5E5E5] dark:bg-[hsl(220,20%,18%)] skeleton-pulse" />
          </div>
          {columns.map((col, colIdx) => (
            <div
              key={col.id}
              className="shrink-0 flex items-center px-3 border-r border-[#E5E5E5] dark:border-[hsl(220,15%,25%)]"
              style={{ width: col.width || DEFAULT_COL_WIDTH, minWidth: col.width || DEFAULT_COL_WIDTH }}
            >
              <div
                className="h-3 rounded bg-[#E5E5E5] dark:bg-[hsl(220,20%,18%)] skeleton-pulse"
                style={{
                  width: `${40 + ((rowIdx * 7 + colIdx * 13) % 50)}%`,
                  animationDelay: `${(rowIdx * 50 + colIdx * 30) % 600}ms`,
                }}
              />
            </div>
          ))}
        </div>
      ))}

      <style>{`
        @keyframes skeletonPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .skeleton-pulse {
          animation: skeletonPulse 1.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
