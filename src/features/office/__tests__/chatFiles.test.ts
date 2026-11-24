import { describe, expect, it } from 'vitest';
import { MAX_FILE_BYTES, checkAttachment, fileKind, formatBytes, isPicture, parseMentions, safeFileName } from '../chat';

const people = [{ id: 'a', name: 'Ada Obi' }, { id: 'b', name: 'Kelvin Sampson' }, { id: 'c', name: 'Zed' }];

describe('attachments', () => {
  it('accepts pictures up to 5 MB and other allowed files up to 25 MB', () => {
    expect(checkAttachment({ name: 'a.png', type: 'image/png', size: 1000 })).toBeNull();
    expect(checkAttachment({ name: 'a.png', type: 'image/png', size: 6 * 1024 * 1024 })).toMatch(/5 MB/);
    expect(checkAttachment({ name: 'plan.pdf', type: 'application/pdf', size: 3 * 1024 * 1024 })).toBeNull();
    expect(checkAttachment({ name: 'big.zip', type: 'application/zip', size: MAX_FILE_BYTES + 1 })).toMatch(/25 MB/);
  });
  it('refuses scripts, web pages, svg and empty files', () => {
    expect(checkAttachment({ name: 'x.html', type: 'text/html', size: 10 })).toMatch(/not a type/);
    expect(checkAttachment({ name: 'x.svg', type: 'image/svg+xml', size: 10 })).toMatch(/not a type/);
    expect(checkAttachment({ name: 'x.exe', type: 'application/x-msdownload', size: 10 })).toMatch(/not a type/);
    expect(checkAttachment({ name: 'e.pdf', type: 'application/pdf', size: 0 })).toMatch(/empty/);
  });
  it('knows pictures, kinds, sizes and safe names', () => {
    expect(isPicture('image/webp')).toBe(true);
    expect(isPicture('image/svg+xml')).toBe(false);
    expect(fileKind('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'q.xlsx')).toBe('sheet');
    expect(fileKind('application/pdf', 'a.pdf')).toBe('pdf');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(safeFileName('../my report (final).pdf')).toBe('my_report_final_.pdf');
  });
});

describe('@mentions', () => {
  it('tags people by first or full name', () => {
    expect(parseMentions('hi @Ada and @Kelvin Sampson', people).sort()).toEqual(['a', 'b']);
  });
  it('@everyone tags the whole team only for people allowed to', () => {
    expect(parseMentions('@everyone please read', people)).toEqual([]);
    expect(parseMentions('@everyone please read', people, { everyone: true }).sort()).toEqual(['a', 'b', 'c']);
    expect(parseMentions('mail@all.com', people, { everyone: true })).toEqual([]);
  });
});
