import { describe, it, expect } from 'vitest';
import { isCoApprovalRequired } from './transfer-safety';

describe('isCoApprovalRequired', () => {
  it('returns false when threshold is null (co-approval never required)', () => {
    expect(isCoApprovalRequired(null, 50_000_000)).toBe(false);
    expect(isCoApprovalRequired(null, 1)).toBe(false);
  });

  it('returns false when threshold is undefined', () => {
    expect(isCoApprovalRequired(undefined, 50_000_000)).toBe(false);
  });

  it('treats 0 / negative threshold as "never required" (matches RPC semantics)', () => {
    // 0 is a degenerate config: it would mean "every transfer needs co-approval",
    // which is almost certainly a misconfiguration. Mirror the RPC's behaviour
    // and treat as NULL until the operator picks a real number.
    expect(isCoApprovalRequired(0, 1)).toBe(false);
    expect(isCoApprovalRequired(-1, 1_000_000)).toBe(false);
  });

  it('returns false when amount is at or below threshold', () => {
    expect(isCoApprovalRequired(10_000_000, 9_999_999)).toBe(false);
    expect(isCoApprovalRequired(10_000_000, 10_000_000)).toBe(false);
  });

  it('returns true when amount strictly exceeds threshold', () => {
    expect(isCoApprovalRequired(10_000_000, 10_000_001)).toBe(true);
    expect(isCoApprovalRequired(5_000_000, 50_000_000)).toBe(true);
  });

  it('handles non-finite inputs without throwing', () => {
    // The threshold is read off the DB row — a bad row should degrade
    // gracefully rather than crash the UI.
    expect(isCoApprovalRequired(NaN, 1_000_000)).toBe(false);
    expect(isCoApprovalRequired(Infinity, 1_000_000)).toBe(false);
  });
});
