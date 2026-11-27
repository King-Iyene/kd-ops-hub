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

import { groupDuplicateAccounts, mergeDuplicateAccounts } from '../batchDuplicates';
import { friendlyDbError } from '../db-errors';

describe('the duplicate dialog and the plain message', () => {
  it('groups the lines that share an account', () => {
    const a = { name: 'A', account_number: '0000000001', amount_ngn: 100 };
    const b = { name: 'B', account_number: '0000000001', amount_ngn: 50 };
    const c = { name: 'C', account_number: '0000000002', amount_ngn: 10 };
    expect(groupDuplicateAccounts([a, b, c])).toEqual([{ account: '0000000001', lines: [a, b] }]);
    expect(groupDuplicateAccounts([a, c])).toEqual([]);
  });
  it('adds the amounts into the first line when they are meant to be paid together', () => {
    const a = { name: 'A', account_number: '0000000001', amount_ngn: 100 };
    const b = { name: 'B', account_number: '0000000001', amount_ngn: 50 };
    const c = { name: 'C', account_number: '0000000002', amount_ngn: 10 };
    const r = mergeDuplicateAccounts([a, b, c]);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ name: 'A', amount_ngn: 150 });
    expect(r[1]).toBe(c);
  });
  it('explains the database refusal in words people can act on', () => {
    const msg = friendlyDbError({ message: 'duplicate key value violates unique constraint "uq_batch_items_batch_account"' });
    expect(msg).toContain('same bank account');
    expect(msg).toContain('Remove one');
    expect(msg).not.toContain('uq_batch');
  });
});
