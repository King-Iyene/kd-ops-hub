import { describe, it, expect } from 'vitest';
import { findPostApprovalAdjustments, type AdjustmentLike } from '@/lib/payroll-post-approval';

const adj = (id: string, created_at: string, amount_ngn: number | string | null = 1000): AdjustmentLike => ({
  id,
  created_at,
  amount_ngn,
});

const APPROVED = '2026-11-20T10:00:00.000Z';

describe('findPostApprovalAdjustments', () => {
  it('finds adjustments added after approval', () => {
    const r = findPostApprovalAdjustments(
      [adj('a', '2026-11-20T11:00:00.000Z', 5000), adj('b', '2026-11-21T09:00:00.000Z', 2500)],
      APPROVED,
    );
    expect(r?.adjustments.map((a) => a.id)).toEqual(['a', 'b']);
    expect(r?.totalNgn).toBe(7500);
  });

  it('ignores adjustments made before approval', () => {
    const r = findPostApprovalAdjustments(
      [adj('early', '2026-11-19T10:00:00.000Z', 5000)],
      APPROVED,
    );
    expect(r?.adjustments).toEqual([]);
    expect(r?.totalNgn).toBe(0);
  });

  it('treats one made at the exact approval instant as before, not after', () => {
    // Strictly after. An adjustment saved in the same instant as the approval
    // was part of what the approver saw, not a change to it.
    const r = findPostApprovalAdjustments([adj('same', APPROVED)], APPROVED);
    expect(r?.adjustments).toEqual([]);
  });

  it('separates a mixed list correctly', () => {
    const r = findPostApprovalAdjustments(
      [
        adj('before', '2026-11-19T23:59:59.000Z', 100),
        adj('after', '2026-11-20T10:00:01.000Z', 200),
      ],
      APPROVED,
    );
    expect(r?.adjustments.map((a) => a.id)).toEqual(['after']);
    expect(r?.totalNgn).toBe(200);
  });

  it('returns null when the run was never approved', () => {
    // Not an empty result: "nothing changed after approval" would be a
    // stronger claim than the data supports when there is no approval.
    expect(findPostApprovalAdjustments([adj('a', '2026-11-20T11:00:00.000Z')], null)).toBeNull();
    expect(findPostApprovalAdjustments([adj('a', '2026-11-20T11:00:00.000Z')], undefined)).toBeNull();
    expect(findPostApprovalAdjustments([adj('a', '2026-11-20T11:00:00.000Z')], '')).toBeNull();
  });

  it('returns null for an unparseable approval time rather than guessing', () => {
    expect(findPostApprovalAdjustments([adj('a', '2026-11-20T11:00:00.000Z')], 'not-a-date')).toBeNull();
  });

  it('skips adjustments with an unparseable timestamp instead of counting them', () => {
    const r = findPostApprovalAdjustments(
      [adj('bad', 'nonsense', 999), adj('good', '2026-11-21T09:00:00.000Z', 1)],
      APPROVED,
    );
    expect(r?.adjustments.map((a) => a.id)).toEqual(['good']);
    expect(r?.totalNgn).toBe(1);
  });

  it('handles numeric amounts arriving as strings from the database', () => {
    const r = findPostApprovalAdjustments([adj('a', '2026-11-21T09:00:00.000Z', '2500.50')], APPROVED);
    expect(r?.totalNgn).toBe(2500.5);
  });

  it('treats a null amount as zero rather than NaN', () => {
    const r = findPostApprovalAdjustments([adj('a', '2026-11-21T09:00:00.000Z', null)], APPROVED);
    expect(r?.totalNgn).toBe(0);
  });

  it('handles an empty adjustment list', () => {
    const r = findPostApprovalAdjustments([], APPROVED);
    expect(r?.adjustments).toEqual([]);
    expect(r?.totalNgn).toBe(0);
  });
});
