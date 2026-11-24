import { describe, expect, it } from 'vitest';
import { isMirrored } from '../world/world';

describe('turning a piece', () => {
  it('a square piece (a chair) shows the other way round on every other turn', () => {
    expect([0, 1, 2, 3].map((r) => isMirrored({ t: 'chair', r: r as 0 | 1 | 2 | 3 }))).toEqual([false, true, false, true]);
  });
  it('a long piece (a sofa) swaps its footprint on quarter turns and is flipped on the half turns', () => {
    expect([0, 1, 2, 3].map((r) => isMirrored({ t: 'sofa', r: r as 0 | 1 | 2 | 3 }))).toEqual([false, false, true, true]);
  });
  it('never flips writing, bikes or pets', () => {
    for (const t of ['whiteboard', 'valueswall', 'kanban', 'bike', 'dog'] as const) expect([1, 2, 3].some((r) => isMirrored({ t, r: r as 1 | 2 | 3 }))).toBe(false);
  });
});
