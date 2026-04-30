import { describe, it, expect } from 'vitest';
import { parseNigerianPhone, toTermiiNumber, formatNigerianPhone } from './phone';

describe('parseNigerianPhone', () => {
  it('accepts 11-digit local form', () => {
    expect(parseNigerianPhone('08012345678')).toMatchObject({
      ok: true,
      e164: '+2348012345678',
      termii: '2348012345678',
      local: '08012345678',
    });
  });

  it('accepts 13-digit international form without plus', () => {
    expect(parseNigerianPhone('2348012345678').e164).toBe('+2348012345678');
  });

  it('accepts +234 international form', () => {
    expect(parseNigerianPhone('+234 801 234 5678').termii).toBe('2348012345678');
  });

  it('strips spaces, dashes, parens, dots', () => {
    expect(parseNigerianPhone('(0801) 234-5678').e164).toBe('+2348012345678');
    expect(parseNigerianPhone('0801.234.5678').e164).toBe('+2348012345678');
  });

  it('accepts 10-digit bare form and prepends a 0', () => {
    expect(parseNigerianPhone('8012345678').e164).toBe('+2348012345678');
  });

  it('rejects empty / null / undefined input', () => {
    expect(parseNigerianPhone(null).ok).toBe(false);
    expect(parseNigerianPhone(undefined).ok).toBe(false);
    expect(parseNigerianPhone('').ok).toBe(false);
  });

  it('rejects too-short numbers', () => {
    expect(parseNigerianPhone('080123').ok).toBe(false);
  });

  it('rejects landline / non-mobile prefixes', () => {
    // 0100 (Lagos landline), 020X (NITEL), 040X (Aba) — all not 070/080/090.
    expect(parseNigerianPhone('01001234567').ok).toBe(false);
    expect(parseNigerianPhone('02012345678').ok).toBe(false);
    expect(parseNigerianPhone('04012345678').ok).toBe(false);
  });

  it('accepts every NG mobile lead (070/080/090 ranges)', () => {
    // One sample per major lead — any 070x/080x/090x is a valid NG mobile.
    const samples = ['0701', '0703', '0708', '0709',
                     '0801', '0803', '0805', '0809', '0813', '0816',
                     '0901', '0903', '0908', '0915'];
    for (const p of samples) {
      const r = parseNigerianPhone(p + '1234567');
      expect(r.ok, `${p}1234567 should be valid`).toBe(true);
    }
  });

  it('rejects an international number padded to 13 digits but not NG', () => {
    // 13 digits, but doesn't start with 234.
    expect(parseNigerianPhone('1112345678901').ok).toBe(false);
  });
});

describe('toTermiiNumber', () => {
  it('returns digits-only international form for valid inputs', () => {
    expect(toTermiiNumber('08012345678')).toBe('2348012345678');
    expect(toTermiiNumber('+2348012345678')).toBe('2348012345678');
  });

  it('returns null for invalid inputs (callers should silently skip)', () => {
    expect(toTermiiNumber(null)).toBeNull();
    expect(toTermiiNumber('1234')).toBeNull();
  });
});

describe('formatNigerianPhone', () => {
  it('formats the local form with sensible groupings', () => {
    expect(formatNigerianPhone('08012345678')).toBe('0801 234 5678');
    expect(formatNigerianPhone('+2348012345678')).toBe('0801 234 5678');
  });

  it('returns the original input verbatim if invalid', () => {
    expect(formatNigerianPhone('foo')).toBe('foo');
  });
});
