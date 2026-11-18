import { describe, expect, it } from 'vitest';
import { STATUS_LABEL, timeLeft, validEmail, visitLink } from '../guest/guestUtils';

describe('guest helpers', () => {
  it('accepts real emails and rejects junk', () => {
    expect(validEmail('ada@example.com')).toBe(true);
    expect(validEmail(' ada@example.co.uk ')).toBe(true);
    expect(validEmail('ada@example')).toBe(false);
    expect(validEmail('a da@example.com')).toBe(false);
    expect(validEmail('<x>@example.com')).toBe(false);
    expect(validEmail('')).toBe(false);
  });

  it('says how long a visit has left', () => {
    const now = Date.parse('2026-01-01T10:00:00Z');
    expect(timeLeft(null, now)).toBe('');
    expect(timeLeft('2026-01-01T09:59:00Z', now)).toBe('ended');
    expect(timeLeft('2026-01-01T10:00:20Z', now)).toBe('1 min left');
    expect(timeLeft('2026-01-01T10:45:00Z', now)).toBe('45 min left');
    expect(timeLeft('2026-01-01T11:12:00Z', now)).toBe('1 h 12 min left');
  });

  it('builds the link without a double slash', () => {
    expect(visitLink('https://ops.kdsquares.com/', 'abc')).toBe('https://ops.kdsquares.com/visit/abc');
  });

  it('has a label for every status', () => {
    for (const s of ['invited', 'waiting', 'approved', 'denied', 'ended'] as const) expect(STATUS_LABEL[s]).toBeTruthy();
  });
});
