/**
 * One place that turns a stored number into the text shown in a cell, the
 * footer, the expanded record and formula results, so the same value never
 * reads "₦8,500,000.00" in one place, "NGN8,500,000" in another and
 * "603,123.664" in a third.
 *
 * Numbers are stored as plain numbers; everything here is display only.
 */

export interface NumberDisplayOptions {
  /** Digits after the decimal point (0 to 8). Leave out for the field type's default. */
  precision?: number | null;
  /** Group thousands (1,234,567). Default true. */
  thousands?: boolean;
  /** "minus" shows -1,234.00 (default); "parentheses" shows (1,234.00). */
  negativeStyle?: 'minus' | 'parentheses';
  /** Show 1.2M instead of 1,200,000 (display only; the full value is kept). */
  abbreviate?: boolean;
  /** Text before and after the number, for plain numbers only. */
  prefix?: string;
  suffix?: string;
}

const SYMBOL_TO_ISO: Record<string, string> = {
  '₦': 'NGN', '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR',
  '₩': 'KRW', '₽': 'RUB', '₺': 'TRY', '₴': 'UAH', '₸': 'KZT', '₫': 'VND',
  '₵': 'GHS', 'R': 'ZAR', 'Fr': 'CHF', 'kr': 'SEK', 'zł': 'PLN', 'Kč': 'CZK',
};

// Symbols that are ambiguous when shortened to "$" or "¥".
const SYMBOL_OVERRIDES: Record<string, string> = {
  CAD: 'CA$', AUD: 'A$', NZD: 'NZ$', HKD: 'HK$', SGD: 'S$', MXN: 'MX$', CNY: 'CN¥', BRL: 'R$',
};

/** Accepts "NGN", "₦" or a messy value and returns a three letter ISO code. */
export function resolveCurrencyCode(raw: unknown): string {
  if (typeof raw !== 'string') return 'USD';
  const trimmed = raw.trim();
  if (/^[A-Za-z]{3}$/.test(trimmed)) return trimmed.toUpperCase();
  return SYMBOL_TO_ISO[trimmed] ?? 'USD';
}

const symbolCache = new Map<string, string>();

/** "₦" for NGN, "$" for USD, "CA$" for CAD. Falls back to the code itself. */
export function currencySymbol(code: unknown): string {
  const iso = resolveCurrencyCode(code);
  const hit = symbolCache.get(iso);
  if (hit !== undefined) return hit;
  let symbol = SYMBOL_OVERRIDES[iso];
  if (!symbol) {
    try {
      const part = new Intl.NumberFormat('en-US', { style: 'currency', currency: iso, currencyDisplay: 'narrowSymbol' })
        .formatToParts(0)
        .find((p) => p.type === 'currency');
      symbol = part?.value ?? iso;
    } catch {
      symbol = iso;
    }
  }
  symbolCache.set(iso, symbol);
  return symbol;
}

function clampPrecision(p: number | string | null | undefined, fallback: number): number {
  if (p == null || p === '') return fallback;
  const n = Number(p);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(8, Math.max(0, Math.round(n)));
}

const formatterCache = new Map<string, Intl.NumberFormat>();
function formatter(key: string, make: () => Intl.NumberFormat): Intl.NumberFormat {
  let f = formatterCache.get(key);
  if (!f) {
    f = make();
    formatterCache.set(key, f);
  }
  return f;
}

/** Plain number. Without a precision, shows up to 3 decimals and drops trailing zeros. */
export function formatNumber(value: number, opts: NumberDisplayOptions & { defaultPrecision?: number | null } = {}): string {
  if (!Number.isFinite(value)) return String(value);
  const grouping = opts.thousands !== false;
  const fixed = opts.precision ?? opts.defaultPrecision ?? null;
  let body: string;
  if (opts.abbreviate) {
    const digits = fixed == null ? 1 : clampPrecision(fixed, 1);
    body = formatter(`c:${digits}`, () => new Intl.NumberFormat('en-US', {
      notation: 'compact', maximumFractionDigits: digits,
    })).format(Math.abs(value));
  } else {
    const min = fixed == null ? 0 : clampPrecision(fixed, 0);
    const max = fixed == null ? 3 : min;
    body = formatter(`n:${min}:${max}:${grouping}`, () => new Intl.NumberFormat('en-US', {
      minimumFractionDigits: min, maximumFractionDigits: max, useGrouping: grouping,
    })).format(Math.abs(value));
  }
  const text = `${opts.prefix ?? ''}${body}${opts.suffix ?? ''}`;
  return applySign(value, body, text, opts.negativeStyle);
}

function isNegative(value: number, body: string): boolean {
  // "-0.00" must not show as negative: judge by what is actually displayed.
  return value < 0 && /[1-9]/.test(body);
}

function applySign(value: number, body: string, text: string, style: NumberDisplayOptions['negativeStyle']): string {
  if (!isNegative(value, body)) return text;
  return style === 'parentheses' ? `(${text})` : `-${text}`;
}

/** Money with the currency symbol, for example ₦8,500,000.00 or -$12.50. */
export function formatCurrency(
  value: number,
  opts: NumberDisplayOptions & { currencyCode?: unknown } = {},
): string {
  if (!Number.isFinite(value)) return String(value);
  const iso = resolveCurrencyCode(opts.currencyCode);
  const symbol = currencySymbol(iso);
  const precision = clampPrecision(opts.precision, 2);
  const grouping = opts.thousands !== false;
  let body: string;
  if (opts.abbreviate) {
    body = formatter(`cc:${precision}`, () => new Intl.NumberFormat('en-US', {
      notation: 'compact', maximumFractionDigits: Math.min(precision, 2),
    })).format(Math.abs(value));
  } else {
    body = formatter(`m:${precision}:${grouping}`, () => new Intl.NumberFormat('en-US', {
      minimumFractionDigits: precision, maximumFractionDigits: precision, useGrouping: grouping,
    })).format(Math.abs(value));
  }
  return applySign(value, body, `${symbol}${body}`, opts.negativeStyle);
}

/** A percentage stored as a whole number (50 means 50%). */
export function formatPercent(value: number, opts: NumberDisplayOptions = {}): string {
  if (!Number.isFinite(value)) return String(value);
  const precision = opts.precision == null ? null : clampPrecision(opts.precision, 0);
  const body = formatter(`p:${precision ?? 'auto'}`, () => new Intl.NumberFormat('en-US', {
    minimumFractionDigits: precision ?? 0,
    maximumFractionDigits: precision ?? 2,
  })).format(Math.abs(value));
  return applySign(value, body, `${body}%`, opts.negativeStyle);
}

/** Stored text typed or pasted by a person ("₦1,234.50", "1.2M", "(500)") to a number, or null. */
export function parseNumberInput(raw: string): number | null {
  let text = raw.trim();
  if (!text) return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  // Currency symbol, then sign, then a symbol again: "$-3.5" and "-$3.5" both mean minus 3.5.
  text = text.replace(/[,\s]/g, '').replace(/%$/, '').replace(/^[^\d.+-]+/, '');
  if (text.startsWith('-')) {
    negative = !negative;
    text = text.slice(1);
  } else if (text.startsWith('+')) {
    text = text.slice(1);
  }
  text = text.replace(/^[^\d.+-]+/, '');
  let multiplier = 1;
  const suffix = /([kmbt])$/i.exec(text);
  if (suffix) {
    multiplier = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 }[suffix[1].toLowerCase() as 'k' | 'm' | 'b' | 't'];
    text = text.slice(0, -1);
  }
  if (!/^\d*\.?\d+$|^\d+\.?$/.test(text)) return null;
  const n = Number(text) * multiplier;
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

// ---------------------------------------------------------------------------
// Field settings <-> options (used by the field dialogs)
// ---------------------------------------------------------------------------

export interface NumberFormatSettings {
  /** null means "the field type's default" (none for Number, 2 for Decimal and Currency). */
  precision: number | null;
  thousands: boolean;
  negativeStyle: 'minus' | 'parentheses';
  abbreviate: boolean;
  prefix: string;
  suffix: string;
}

export const DEFAULT_NUMBER_SETTINGS: NumberFormatSettings = {
  precision: null,
  thousands: true,
  negativeStyle: 'minus',
  abbreviate: false,
  prefix: '',
  suffix: '',
};

type LooseOptions = Record<string, unknown>;

export function settingsFromOptions(options: LooseOptions | null | undefined): NumberFormatSettings {
  const o = options ?? {};
  return {
    precision: o.precision != null && o.precision !== '' && Number.isFinite(Number(o.precision)) ? Number(o.precision) : null,
    thousands: o.thousands !== false,
    negativeStyle: o.negativeStyle === 'parentheses' ? 'parentheses' : 'minus',
    abbreviate: o.abbreviate === true,
    prefix: typeof o.prefix === 'string' ? o.prefix : '',
    suffix: typeof o.suffix === 'string' ? o.suffix : '',
  };
}

/**
 * Returns a copy of `options` with the number display settings written in.
 * Only non-default values are stored, so a field left on defaults stays clean
 * and switching a setting back removes its key.
 */
export function applyNumberSettings(
  options: LooseOptions | null | undefined,
  settings: NumberFormatSettings,
  parts: { precision: boolean; affixes: boolean },
): LooseOptions {
  const next: LooseOptions = { ...(options ?? {}) };
  delete next.thousands;
  delete next.negativeStyle;
  delete next.abbreviate;
  if (parts.affixes) {
    delete next.prefix;
    delete next.suffix;
  }
  if (parts.precision) {
    if (settings.precision == null) delete next.precision;
    else next.precision = clampPrecision(settings.precision, 0);
  }
  if (!settings.thousands) next.thousands = false;
  if (settings.negativeStyle === 'parentheses') next.negativeStyle = 'parentheses';
  if (settings.abbreviate) next.abbreviate = true;
  if (parts.affixes) {
    if (settings.prefix) next.prefix = settings.prefix;
    if (settings.suffix) next.suffix = settings.suffix;
  }
  return next;
}
