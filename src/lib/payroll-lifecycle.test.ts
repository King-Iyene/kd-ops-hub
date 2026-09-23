import { describe, it, expect } from 'vitest';
import { realStepIndex } from '@/lib/payroll-run';

/**
 * The payroll progress rail is the one thing on the screen that answers
 * "where is my payroll right now?". These tests pin the mapping so a future
 * status added to the backend can't silently land a run on the wrong step —
 * or, worse, on no step at all while the rail still renders.
 */
describe('realStepIndex', () => {
  it('maps each backend status to its visible stage', () => {
    expect(realStepIndex('draft')).toBe(0);
    expect(realStepIndex('pending_approval')).toBe(1);
    expect(realStepIndex('approved')).toBe(2);
    expect(realStepIndex('paid')).toBe(3);
  });

  it('treats processing as still sitting on Approved', () => {
    // Disbursement is what happens right after approval, not a stage a
    // person waits in — so it must not read as a fifth step.
    expect(realStepIndex('processing')).toBe(realStepIndex('approved'));
  });

  it('returns -1 for statuses that have no place on the rail', () => {
    // The rail renders nothing for these; a status badge alone is clearer
    // than a progress bar that can never complete.
    expect(realStepIndex('rejected')).toBe(-1);
    expect(realStepIndex('cancelled')).toBe(-1);
    expect(realStepIndex('')).toBe(-1);
    expect(realStepIndex('something_new')).toBe(-1);
  });

  it('never returns an index outside the four real stages', () => {
    const statuses = [
      'draft', 'pending_approval', 'approved', 'processing', 'paid',
      'rejected', 'cancelled', 'unknown',
    ];
    for (const s of statuses) {
      const i = realStepIndex(s);
      expect(i).toBeGreaterThanOrEqual(-1);
      expect(i).toBeLessThanOrEqual(3);
    }
  });

  it('orders the stages so progress only ever moves forward', () => {
    expect(realStepIndex('draft')).toBeLessThan(realStepIndex('pending_approval'));
    expect(realStepIndex('pending_approval')).toBeLessThan(realStepIndex('approved'));
    expect(realStepIndex('approved')).toBeLessThan(realStepIndex('paid'));
  });
});
