import { describe, expect, it } from 'vitest';
import { splitDuplicateAccounts } from '../batchDuplicates';

describe('one account, one line per batch', () => {
  it('keeps the first line of a shared account and reports the rest', () => {
    const a = { name: 'Person One', account_number: '0000000001' };
    const b = { name: 'Person One Junior', account_number: '0000000001' };
    const c = { name: 'Person Two', account_number: '0000000002' };
    const r = splitDuplicateAccounts([a, c, b]);
    expect(r.keep).toEqual([a, c]);
    expect(r.duplicates).toEqual([{ item: b, keptWith: a }]);
  });
  it('ignores spaces and keeps lines with no account number', () => {
    const a = { account_number: '0000000001' };
    const b = { account_number: '0000 000 001' };
    const x = { account_number: '' };
    const y = { account_number: null };
    const r = splitDuplicateAccounts([a, b, x, y]);
    expect(r.keep).toEqual([a, x, y]);
    expect(r.duplicates).toHaveLength(1);
  });
  it('does nothing when there are no duplicates', () => {
    const items = [{ account_number: '1' }, { account_number: '2' }];
    expect(splitDuplicateAccounts(items).duplicates).toHaveLength(0);
  });
});
