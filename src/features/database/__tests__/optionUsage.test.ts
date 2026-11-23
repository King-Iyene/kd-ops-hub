import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('../hooks/tableBootstrap', () => ({ resolveTableContext: vi.fn() }));

import { describeOptionRemoval } from '../lib/optionUsage';

describe('the warning before removing an option', () => {
  it('names the option and the number of records, and says the text stays', () => {
    expect(describeOptionRemoval('Sales', 1)).toBe(
      '"Sales" is used by 1 record. Those records keep the text, but it will no longer be one of the options. Remove it?',
    );
    expect(describeOptionRemoval('Sales', 1200)).toContain('1,200 records');
  });
});
