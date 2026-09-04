import React from 'react';

const SKELETON_ROWS = 12;
const SKELETON_COLS = 6;
const ROW_NUMBER_WIDTH = 72;
const HEADER_HEIGHT = 36;

export function GridSkeleton({ rowHeight = 44 }: { rowHeight?: number }) {
  return (
    <div className="flex flex-col h-full animate-in fade-in duration-200">
      {/* Header skeleton */}
      <div
        className="flex border-b border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] bg-[#F9F9FA] dark:bg-[hsl(200,25%,11%)]"
        style={{ height: HEADER_HEIGHT }}
      >
        <div
          className="shrink-0 border-r border-[#E5E5E5] dark:border-[hsl(200,25%,18%)]"
          style={{ width: ROW_NUMBER_WIDTH, minWidth: ROW_NUMBER_WIDTH }}
        />
        {Array.from({ length: SKELETON_COLS }).map((_, i) => (
          <div
            key={i}
            className="shrink-0 flex items-center px-3 border-r border-[#E5E5E5] dark:border-[hsl(200,25%,18%)]"
            style={{ width: 180 }}
          >
            <div className="h-3 rounded bg-[#E5E5E5] dark:bg-[hsl(200,25%,18%)] skeleton-pulse" style={{ width: 60 + Math.random() * 40 }} />
          </div>
        ))}
      </div>

      {/* Row skeletons */}
      {Array.from({ length: SKELETON_ROWS }).map((_, rowIdx) => (
        <div
          key={rowIdx}
          className="flex border-b border-[#E5E5E5] dark:border-[hsl(200,25%,18%)]"
          style={{ height: rowHeight }}
        >
          <div
            className="shrink-0 flex items-center justify-center border-r border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] bg-[#F9F9FA] dark:bg-[hsl(200,25%,11%)]"
            style={{
              width: ROW_NUMBER_WIDTH,
              minWidth: ROW_NUMBER_WIDTH,
            }}
          >
            <div className="h-3 w-4 rounded bg-[#E5E5E5] dark:bg-[hsl(200,25%,18%)] skeleton-pulse" />
          </div>
          {Array.from({ length: SKELETON_COLS }).map((_, colIdx) => (
            <div
              key={colIdx}
              className="shrink-0 flex items-center px-3 border-r border-[#E5E5E5] dark:border-[hsl(200,25%,18%)]"
              style={{ width: 180 }}
            >
              <div
                className="h-3 rounded bg-[#E5E5E5] dark:bg-[hsl(200,25%,18%)] skeleton-pulse"
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
