import { useEffect, useState } from 'react';

interface Dims { w: number; h: number }

/**
 * The desktop app joins every monitor, left to right, into ONE wide image, each
 * screen captured at roughly 16:9. A three-monitor capture is about 5.3:1, so
 * shown "fit to width" each screen is tiny. This works out how many screens are
 * in the image so they can be shown one under another, each at full width.
 * Falls back to 1 (show the image as is) when the shape doesn't look like N
 * evenly sized screens.
 */
export function estimateScreens(d: Dims | null): number {
  if (!d || d.h === 0) return 1;
  const perScreenWidth = (d.h * 16) / 9;
  const n = Math.round(d.w / perScreenWidth);
  return n >= 2 && Math.abs(d.w / (n * perScreenWidth) - 1) < 0.12 ? n : 1;
}

export function useImageDims(url: string | undefined): Dims | null {
  const [dims, setDims] = useState<Dims | null>(null);
  useEffect(() => {
    if (!url) { setDims(null); return; }
    let cancelled = false;
    const img = new Image();
    img.onload = () => { if (!cancelled) setDims({ w: img.naturalWidth, h: img.naturalHeight }); };
    img.src = url;
    return () => { cancelled = true; };
  }, [url]);
  return dims;
}

interface Props {
  url: string;
  /** 'stacked' = one screen per row, each full width (big). 'wide' = the whole image as one strip. */
  layout: 'stacked' | 'wide';
  /** 1 = fit the width of the box; larger values make it bigger (optional extra). */
  zoom?: number;
  /** show just this screen (0 is the first), as big as fits, instead of all of them */
  only?: number | null;
  onClickImage?: () => void;
}

export function ScreenPanels({ url, layout, zoom = 1, only = null, onClickImage }: Props) {
  const dims = useImageDims(url);
  const n = estimateScreens(dims);
  const width = `${zoom * 100}%`;

  if (layout === 'wide' || n === 1 || !dims) {
    return (
      <img
        src={url}
        alt="Screenshot"
        draggable={false}
        onClick={onClickImage}
        className="block max-w-none cursor-zoom-in"
        style={{ width }}
      />
    );
  }

  const panelAspect = `${dims.w / n} / ${dims.h}`;
  const aspect = dims.w / n / dims.h;
  if (only != null && only >= 0 && only < n) {
    // one screen at a time: as big as fits the window at 100%, and the zoom makes it larger or smaller from there
    const i = only;
    return (
      <div className="mx-auto" style={{ width: `calc(min(100%, calc(74vh * ${aspect.toFixed(4)})) * ${zoom})` }}>
        <p className="px-1 pb-0.5 text-[11px] text-muted-foreground">Screen {i + 1} of {n}</p>
        <div
          role="img"
          aria-label={`Screen ${i + 1} of ${n}`}
          onClick={onClickImage}
          className="w-full cursor-zoom-in bg-black"
          style={{
            aspectRatio: panelAspect,
            backgroundImage: `url("${url}")`,
            backgroundRepeat: 'no-repeat',
            backgroundSize: `${n * 100}% 100%`,
            backgroundPosition: `${(i / (n - 1)) * 100}% 0`,
          }}
        />
      </div>
    );
  }
  return (
    <div className="space-y-2" style={{ width }}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i}>
          <p className="px-1 pb-0.5 text-[11px] text-muted-foreground">Screen {i + 1} of {n}</p>
          <div
            role="img"
            aria-label={`Screen ${i + 1} of ${n}`}
            onClick={onClickImage}
            className="w-full cursor-zoom-in bg-black"
            style={{
              aspectRatio: panelAspect,
              backgroundImage: `url("${url}")`,
              backgroundRepeat: 'no-repeat',
              backgroundSize: `${n * 100}% 100%`,
              backgroundPosition: `${(i / (n - 1)) * 100}% 0`,
            }}
          />
        </div>
      ))}
    </div>
  );
}
