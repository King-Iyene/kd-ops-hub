import { SearchX } from 'lucide-react';
import type { Narrowing } from '../lib/filterRules';

/**
 * Shown instead of "No records yet" when the table has rows but filters or a search are hiding all of them.
 * It says what is hiding them and offers one click to bring them back.
 */
export function NoMatches({
  narrowing,
  onClearFilters,
  onClearSearch,
  colors,
}: {
  narrowing: Narrowing;
  onClearFilters: () => void;
  onClearSearch: () => void;
  colors: { bg: string; text: string; muted: string; groupHeaderBg: string; primary: string };
}) {
  return (
    <div
      className="flex flex-col items-center justify-center flex-1 min-h-64 gap-4"
      style={{ backgroundColor: colors.bg }}
      data-no-matches
    >
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ backgroundColor: colors.groupHeaderBg }}>
        <SearchX size={28} style={{ color: colors.muted }} aria-hidden="true" />
      </div>
      <div className="text-center max-w-xs">
        <p style={{ color: colors.text, fontSize: 14, fontWeight: 600 }}>No records match</p>
        <p style={{ color: colors.muted, fontSize: 13 }} className="mt-1">
          {narrowing.text} Nothing has been deleted.
        </p>
      </div>
      <div className="flex gap-2">
        {narrowing.conditions > 0 && (
          <button
            type="button"
            onClick={onClearFilters}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            style={{ backgroundColor: colors.primary }}
          >
            Clear filters
          </button>
        )}
        {narrowing.hasSearch && (
          <button
            type="button"
            onClick={onClearSearch}
            className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{ color: colors.text }}
          >
            Clear search
          </button>
        )}
      </div>
    </div>
  );
}
