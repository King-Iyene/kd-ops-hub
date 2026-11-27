import { describe, it, expect, vi } from 'vitest';
import { createExclusiveOpen } from '../lib/exclusiveOpen';

describe('createExclusiveOpen', () => {
  it('closes the one that was open when another opens', () => {
    const lists = createExclusiveOpen();
    const a = vi.fn();
    const b = vi.fn();
    lists.claim(a);
    lists.claim(b);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
  });

  it('does not close itself when it claims again', () => {
    const lists = createExclusiveOpen();
    const a = vi.fn();
    lists.claim(a);
    lists.claim(a);
    expect(a).not.toHaveBeenCalled();
  });

  it('forgets a list that closed on its own', () => {
    const lists = createExclusiveOpen();
    const a = vi.fn();
    const b = vi.fn();
    lists.claim(a);
    lists.release(a);
    lists.claim(b);
    expect(a).not.toHaveBeenCalled();
  });
});
