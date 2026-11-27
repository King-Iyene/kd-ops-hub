import { describe, it, expect } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { removeRowsFromRecordsCache } from '../hooks/useRecords';

const row = (id: string) => ({ id });

describe('removeRowsFromRecordsCache', () => {
  it('takes the rows out of every loaded page and lowers the count at once', () => {
    const qc = new QueryClient();
    const key = ['nc', 'records', 'base1', 'table1', 'view-a'];
    qc.setQueryData(key, {
      pages: [
        { records: [row('a'), row('b')], totalCount: 4, offset: 0 },
        { records: [row('c'), row('d')], totalCount: 4, offset: 2 },
      ],
      pageParams: [0, 2],
    });

    removeRowsFromRecordsCache(qc, 'base1', 'table1', ['b', 'c']);

    const after = qc.getQueryData<any>(key);
    expect(after.pages.flatMap((p: any) => p.records.map((r: any) => r.id))).toEqual(['a', 'd']);
    expect(after.pages[0].totalCount).toBe(2);
  });

  it('hands back what was there so a failed delete can put it back', () => {
    const qc = new QueryClient();
    const key = ['nc', 'records', 'base1', 'table1'];
    const original = { records: [row('a'), row('b')], totalCount: 2 };
    qc.setQueryData(key, original);

    const previous = removeRowsFromRecordsCache(qc, 'base1', 'table1', ['a']);

    expect(previous).toHaveLength(1);
    expect(previous[0][1]).toEqual(original);
    expect(qc.getQueryData<any>(key).records.map((r: any) => r.id)).toEqual(['b']);
  });

  it('leaves other tables alone', () => {
    const qc = new QueryClient();
    const other = ['nc', 'records', 'base1', 'table2'];
    qc.setQueryData(other, { records: [row('a')], totalCount: 1 });

    removeRowsFromRecordsCache(qc, 'base1', 'table1', ['a']);

    expect(qc.getQueryData<any>(other).records).toHaveLength(1);
  });
});
