/** Cell value comparison, used to avoid writing a value that did not change. */

function normalise(v: unknown): unknown {
  if (v === undefined || v === null || v === '') return null;
  return v;
}

/**
 * True when two cell values mean the same thing: empty is empty whether it is
 * null, undefined or an empty string; "12" equals 12; lists and objects compare
 * by content.
 */
export function sameCellValue(a: unknown, b: unknown): boolean {
  const x = normalise(a);
  const y = normalise(b);
  if (x === y) return true;
  if (x === null || y === null) return false;
  if (typeof x === 'object' || typeof y === 'object') {
    try {
      return JSON.stringify(x) === JSON.stringify(y);
    } catch {
      return false;
    }
  }
  if (typeof x === 'number' || typeof y === 'number') {
    const nx = Number(x);
    const ny = Number(y);
    return Number.isFinite(nx) && Number.isFinite(ny) && nx === ny;
  }
  return String(x) === String(y);
}

/** A number as plain digits, never in exponent form ("1e-7" becomes "0.0000001"). */
export function plainNumberString(n: number): string {
  if (!Number.isFinite(n)) return '';
  const s = String(n);
  if (!/e/i.test(s)) return s;
  return n.toFixed(8).replace(/\.?0+$/, '');
}
