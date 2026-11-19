import { beforeEach, describe, expect, it } from 'vitest';
import { afterSignIn, rememberReturnTo, safeReturnPath, takeReturnTo } from '../returnTo';

describe('returning after sign-in', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* fine */ } });
  it('only accepts a path inside this app', () => {
    expect(safeReturnPath('/office')).toBe('/office');
    expect(safeReturnPath('/finance/payroll?month=11')).toBe('/finance/payroll?month=11');
    for (const bad of ['https://evil.example', '//evil.example', '/login', '/login?x=1', '/', '', null, undefined, 42, '\\\\evil', '/a\\b']) expect(safeReturnPath(bad), String(bad)).toBeNull();
  });
  it('goes back to where you were headed, once', () => {
    rememberReturnTo('/office');
    expect(afterSignIn(false)).toBe('/office');
    expect(afterSignIn(false)).toBe('/dashboard');
  });
  it('the desktop app lands in the office, a browser on the dashboard', () => {
    expect(afterSignIn(true)).toBe('/office');
    expect(afterSignIn(false)).toBe('/dashboard');
  });
  it('forgets an old request', () => {
    rememberReturnTo('/office');
    expect(takeReturnTo(Date.now() + 16 * 60 * 1000)).toBeNull();
  });
});
