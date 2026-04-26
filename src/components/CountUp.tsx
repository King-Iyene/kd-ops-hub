import { useEffect, useRef, useState } from 'react';

interface Props {
  value: number;
  /** Format the displayed string (e.g. en-NG currency). Default toLocaleString. */
  format?: (n: number) => string;
  /** Animation duration in ms. Default 700. */
  duration?: number;
  /** Decimals to interpolate at. Default 0. */
  decimals?: number;
  className?: string;
  /** Optional prefix (e.g. ₦). */
  prefix?: string;
  /** Optional suffix (e.g. %). */
  suffix?: string;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Animates from previous value to new value when value changes. Respects
 * prefers-reduced-motion (jumps straight to value). Uses rAF, no libs.
 */
export function CountUp({
  value,
  format,
  duration = 700,
  decimals = 0,
  className,
  prefix,
  suffix,
}: Props) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !Number.isFinite(value)) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = easeOutCubic(t);
      const current = from + (to - from) * eased;
      setDisplay(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  const text = format
    ? format(display)
    : decimals > 0
      ? display.toFixed(decimals)
      : Math.round(display).toLocaleString();

  return (
    <span className={className}>
      {prefix}{text}{suffix}
    </span>
  );
}
