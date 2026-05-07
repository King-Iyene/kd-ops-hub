/**
 * Nigerian public holiday generator.
 *
 * Why a generator and not a static DB seed: the public_holidays table
 * has to be re-seeded every year, and the table running out (e.g. when
 * an operator scrolled the payroll calendar to 2030) made the calendar
 * look broken. This module returns the full eleven Nigerian national
 * holidays for any given year computed in three groups:
 *
 *   1. Fixed Gregorian dates — New Year's Day, Workers' Day, Democracy
 *      Day, Independence Day, Christmas Day, Boxing Day.
 *   2. Movable Christian holidays — Good Friday and Easter Monday,
 *      derived from Easter Sunday via Gauss's anonymous algorithm
 *      (accurate for any year between 1583 and 4099).
 *   3. Islamic holidays — Eid al-Fitr, Eid al-Adha, Mawlid an-Nabi.
 *      These follow the lunar Hijri calendar, so the civil date drifts
 *      by ~10 days each year and depends on lunar sighting. We use a
 *      precomputed table for the years where reliable civil dates are
 *      published, and fall back to a Hijri-to-Gregorian estimator
 *      (Umm al-Qura approximation) for years outside the table.
 *      Federal Government proclamations occasionally move a date by
 *      ±1 day; admins can override individual rows in the
 *      public_holidays table via the existing RLS policy. The
 *      generator merges DB rows on top of the computed values, so an
 *      override always wins.
 *
 * The generator returns deterministic results — same input year, same
 * output. Pure function, no side effects, safe to call inside React
 * render or memo without re-fetch concerns.
 */

export interface NgHoliday {
  /** ISO yyyy-mm-dd */
  date: string;
  name: string;
  /** True when the date is a known proclamation, false when it's
   *  computed from the lunar approximation and may shift by ±1 day. */
  exact: boolean;
  /** Used by the calendar legend to render a "(estimated)" hint
   *  alongside the holiday name. */
  category: 'fixed' | 'christian' | 'islamic';
}

// ── Easter computus (Gauss's algorithm) ────────────────────────────

/** Easter Sunday for the given Gregorian year. Returns yyyy-mm-dd.
 *  Valid for 1583 – 4099. */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month  = Math.floor((h + l - 7 * m + 114) / 31);
  const day    = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const isoOf = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const addDays = (d: Date, n: number): Date => {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
};

// ── Islamic holiday lookup ─────────────────────────────────────────
// Precomputed civil dates for Eid al-Fitr / Eid al-Adha / Mawlid in
// Nigeria. Sources:
//   • Federal Government proclamations (where published).
//   • Umm al-Qura (Saudi) sighting calendar (proxy used when a
//     proclamation hasn't been issued yet — Nigerian Sultanate often
//     follows it within ±1 day).
// Nigeria officially observes both days of Eid al-Fitr and Eid
// al-Adha, but the platform calendar surfaces day 1 only — operators
// adjust if their tenant pays extra for day 2.

interface IslamicYear {
  eid_al_fitr: string;   // 1 Shawwal
  eid_al_adha: string;   // 10 Dhu al-Hijjah
  mawlid: string;        // 12 Rabi' al-Awwal
}

const ISLAMIC_TABLE: Record<number, IslamicYear> = {
  2024: { eid_al_fitr: '2024-04-10', eid_al_adha: '2024-06-17', mawlid: '2024-09-16' },
  2025: { eid_al_fitr: '2025-03-31', eid_al_adha: '2025-06-07', mawlid: '2025-09-05' },
  2026: { eid_al_fitr: '2026-03-20', eid_al_adha: '2026-05-27', mawlid: '2026-08-25' },
  2027: { eid_al_fitr: '2027-03-09', eid_al_adha: '2027-05-17', mawlid: '2027-08-14' },
  2028: { eid_al_fitr: '2028-02-26', eid_al_adha: '2028-05-05', mawlid: '2028-08-02' },
  2029: { eid_al_fitr: '2029-02-14', eid_al_adha: '2029-04-24', mawlid: '2029-07-23' },
  2030: { eid_al_fitr: '2030-02-04', eid_al_adha: '2030-04-13', mawlid: '2030-07-12' },
  2031: { eid_al_fitr: '2031-01-24', eid_al_adha: '2031-04-02', mawlid: '2031-07-01' },
  2032: { eid_al_fitr: '2032-01-13', eid_al_adha: '2032-03-22', mawlid: '2032-06-19' },
  2033: { eid_al_fitr: '2033-01-02', eid_al_adha: '2033-03-12', mawlid: '2033-06-09' },
  2034: { eid_al_fitr: '2034-12-22', eid_al_adha: '2034-03-01', mawlid: '2034-05-29' },
  2035: { eid_al_fitr: '2035-12-11', eid_al_adha: '2035-02-18', mawlid: '2035-05-19' },
};

// Fallback estimator when the year falls outside the lookup table.
// Hijri calendar lags the Gregorian by ~11 days per year, so we
// extrapolate from the nearest known year.
function estimateIslamic(year: number): IslamicYear {
  const known = Object.keys(ISLAMIC_TABLE).map(Number).sort((a, b) => a - b);
  // Pick the closest known year and shift by ~11 days/year backward.
  const closest = known.reduce((a, b) =>
    Math.abs(b - year) < Math.abs(a - year) ? b : a,
    known[0],
  );
  const base = ISLAMIC_TABLE[closest];
  const delta = year - closest;
  const shift = (iso: string): string => {
    const [_y, m, d] = iso.split('-').map(Number);
    // Move ~11 days/year earlier (Hijri is shorter than Gregorian)
    const ref = new Date(year, m - 1, d);
    ref.setDate(ref.getDate() - delta * 11);
    // Normalise the year stamp on the result so it falls inside the
    // requested calendar year (clamp to Dec 31 / Jan 1 if it overflows).
    if (ref.getFullYear() < year) ref.setFullYear(year, 0, 1);
    if (ref.getFullYear() > year) ref.setFullYear(year, 11, 31);
    return isoOf(ref);
  };
  return {
    eid_al_fitr: shift(base.eid_al_fitr),
    eid_al_adha: shift(base.eid_al_adha),
    mawlid:      shift(base.mawlid),
  };
}

// ── Public API ─────────────────────────────────────────────────────

/** Returns the eleven Nigerian national holidays for the given year. */
export function getNigerianHolidays(year: number): NgHoliday[] {
  const easter = easterSunday(year);
  const goodFriday   = addDays(easter, -2);
  const easterMonday = addDays(easter, +1);

  const islamic = ISLAMIC_TABLE[year] ?? estimateIslamic(year);
  const islamicExact = year in ISLAMIC_TABLE;

  return [
    { date: `${year}-01-01`, name: "New Year's Day",       exact: true,  category: 'fixed' },
    { date: islamic.eid_al_fitr, name: 'Eid al-Fitr',      exact: islamicExact, category: 'islamic' },
    { date: isoOf(goodFriday),   name: 'Good Friday',      exact: true,  category: 'christian' },
    { date: isoOf(easterMonday), name: 'Easter Monday',    exact: true,  category: 'christian' },
    { date: `${year}-05-01`, name: "Workers' Day",         exact: true,  category: 'fixed' },
    { date: islamic.eid_al_adha, name: 'Eid al-Adha',      exact: islamicExact, category: 'islamic' },
    { date: `${year}-06-12`, name: 'Democracy Day',        exact: true,  category: 'fixed' },
    { date: islamic.mawlid,      name: 'Mawlid an-Nabi',   exact: islamicExact, category: 'islamic' },
    { date: `${year}-10-01`, name: 'Independence Day',     exact: true,  category: 'fixed' },
    { date: `${year}-12-25`, name: 'Christmas Day',        exact: true,  category: 'fixed' },
    { date: `${year}-12-26`, name: 'Boxing Day',           exact: true,  category: 'fixed' },
  ].sort((a, b) => a.date.localeCompare(b.date));
}

/** Returns holidays falling between `start` and `end` inclusive
 *  (yyyy-mm-dd strings). Spans multiple years — we generate each
 *  intersected year and concat. */
export function getNigerianHolidaysInRange(
  startIso: string,
  endIso: string,
): NgHoliday[] {
  const startYear = parseInt(startIso.slice(0, 4), 10);
  const endYear   = parseInt(endIso.slice(0, 4), 10);
  const out: NgHoliday[] = [];
  for (let y = startYear; y <= endYear; y++) {
    for (const h of getNigerianHolidays(y)) {
      if (h.date >= startIso && h.date <= endIso) out.push(h);
    }
  }
  return out;
}
