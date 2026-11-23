import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useGridColors } from '../../hooks/useGridColors';
import { chipsThatFit, type TextMeasurer } from '../../lib/linkBatch';
import type { LinkedItem } from '../../hooks/useBatchedLinks';

/**
 * The chips of a link cell: as many whole chips as fit the cell, then a "+N" badge that says how many more
 * there are. A name is never squeezed to make room: it is only cut when that one name is longer than the
 * cell itself. Used by every link cell, so they all look and behave the same.
 */

// One canvas for the whole app: measuring text with the real font is far more accurate than a guess.
let measureContext: CanvasRenderingContext2D | null | undefined;

function textMeasurer(font: string): TextMeasurer | undefined {
  if (measureContext === undefined) {
    try {
      // jsdom (the test browser) has no canvas and complains when asked for one.
      const noCanvas = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent);
      measureContext = !noCanvas && typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
    } catch {
      measureContext = null;
    }
  }
  const ctx = measureContext;
  if (!ctx) return undefined;
  // The canvas is shared, so set the font on every measurement rather than trusting nobody else changed it.
  return (text) => {
    ctx.font = font;
    return ctx.measureText(text).width;
  };
}

/** The chip text style, kept in one place so the measuring and the drawing agree. */
const CHIP_FONT_SIZE = 11; // text-2xs
const CHIP_FONT_WEIGHT = 500; // font-medium

export function LinkChips({
  items,
  wrap,
  onChipClick,
}: {
  items: LinkedItem[];
  wrap: boolean;
  /** When given, clicking a chip (or the "+N") calls it instead of reaching the cell; blank space still belongs to the cell. */
  onChipClick?: () => void;
}) {
  const colors = useGridColors();
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [fontFamily, setFontFamily] = useState('');

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    setWidth(el.clientWidth);
    setFontFamily(getComputedStyle(el).fontFamily);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const labels = useMemo(() => items.map((i) => i.label), [items]);
  const measure = useMemo(
    () => (fontFamily ? textMeasurer(`${CHIP_FONT_WEIGHT} ${CHIP_FONT_SIZE}px ${fontFamily}`) : undefined),
    [fontFamily],
  );
  const visibleCount = wrap ? Math.min(items.length, 12) : chipsThatFit(labels, width, measure);
  const hidden = items.length - visibleCount;
  // A lone chip may be cut to the cell's width; with several, none is squeezed.
  const lone = visibleCount === 1;
  const clickable = onChipClick
    ? {
        onClick: (e: ReactMouseEvent) => {
          e.stopPropagation();
          onChipClick();
        },
      }
    : {};
  const clickableClass = onChipClick ? ' cursor-pointer hover:opacity-80 transition-opacity' : '';

  return (
    <div
      ref={boxRef}
      className={`flex gap-1 flex-1 min-w-0 overflow-hidden ${wrap ? 'flex-wrap items-start content-start py-1' : 'items-center'}`}
      title={items.map((i) => i.label).join(', ')}
    >
      {items.slice(0, visibleCount).map((item) => (
        <span
          key={item.id}
          className={`inline-flex items-center px-2 py-0.5 rounded text-2xs font-medium leading-tight max-w-[200px] ${lone ? 'shrink min-w-0' : 'shrink-0'}${clickableClass}`}
          style={{ backgroundColor: colors.linkPillBg, color: colors.linkPillText, letterSpacing: '-0.01em' }}
          data-link-chip
          {...clickable}
        >
          <span className="truncate">{item.label}</span>
        </span>
      ))}
      {hidden > 0 && (
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-2xs font-medium${clickableClass}`}
          style={{ backgroundColor: colors.linkPillBg, color: colors.linkPillText }}
          data-link-more
          {...clickable}
          title={items.slice(visibleCount).map((i) => i.label).join(', ')}
        >
          +{hidden}
        </span>
      )}
    </div>
  );
}
