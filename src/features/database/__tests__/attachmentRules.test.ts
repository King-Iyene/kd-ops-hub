import { describe, expect, it } from 'vitest';
import { acceptAttribute, checkFiles, kindOf } from '../lib/attachmentRules';

const f = (name: string, sizeMB = 1, type = '') => ({ name, size: sizeMB * 1024 * 1024, type });

describe('kindOf', () => {
  it('reads the kind from the type or the extension', () => {
    expect(kindOf(f('photo.JPG'))).toBe('images');
    expect(kindOf(f('x', 1, 'image/png'))).toBe('images');
    expect(kindOf(f('report.pdf'))).toBe('documents');
    expect(kindOf(f('budget.xlsx'))).toBe('spreadsheets');
    expect(kindOf(f('data.csv'))).toBe('spreadsheets');
    expect(kindOf(f('deck.pptx'))).toBe('presentations');
    expect(kindOf(f('all.zip'))).toBe('archives');
    expect(kindOf(f('clip.mp4'))).toBe('video');
    expect(kindOf(f('song.mp3'))).toBe('audio');
    expect(kindOf(f('mystery.bin'))).toBeNull();
  });
});

describe('checkFiles', () => {
  it('accepts everything when there are no limits', () => {
    const { accepted, rejected } = checkFiles([f('a.pdf'), f('b.png')], 0, null);
    expect(accepted).toHaveLength(2);
    expect(rejected).toEqual([]);
  });
  it('refuses files over the size limit and never allows more than 50 MB', () => {
    const r1 = checkFiles([f('big.pdf', 6), f('ok.pdf', 2)], 0, { maxSizeMB: 5 });
    expect(r1.accepted.map((x) => x.name)).toEqual(['ok.pdf']);
    expect(r1.rejected[0].reason).toContain('5 MB');
    const r2 = checkFiles([f('huge.pdf', 60)], 0, { maxSizeMB: 500 });
    expect(r2.accepted).toEqual([]);
    expect(r2.rejected[0].reason).toContain('50 MB');
  });
  it('refuses kinds that are not allowed', () => {
    const { accepted, rejected } = checkFiles([f('a.png'), f('b.pdf'), f('c.bin')], 0, { allowedTypes: ['images'] });
    expect(accepted.map((x) => x.name)).toEqual(['a.png']);
    expect(rejected.map((x) => x.name)).toEqual(['b.pdf', 'c.bin']);
  });
  it('counts files already in the cell against the limit', () => {
    const { accepted, rejected } = checkFiles([f('a.pdf'), f('b.pdf'), f('c.pdf')], 3, { maxCount: 4 });
    expect(accepted.map((x) => x.name)).toEqual(['a.pdf']);
    expect(rejected).toHaveLength(2);
    expect(rejected[0].reason).toContain('at most 4 files');
  });
  it('uses the singular for a limit of one', () => {
    const { rejected } = checkFiles([f('a.pdf')], 1, { maxCount: 1 });
    expect(rejected[0].reason).toContain('1 file');
    expect(rejected[0].reason).not.toContain('files');
  });
  it('treats zero or empty limits as no limit', () => {
    expect(checkFiles([f('a.pdf')], 9, { maxCount: 0, allowedTypes: [] }).accepted).toHaveLength(1);
  });
});

describe('acceptAttribute', () => {
  it('falls back when any kind is allowed', () => {
    expect(acceptAttribute(null, 'image/*,.pdf')).toBe('image/*,.pdf');
    expect(acceptAttribute({ allowedTypes: [] }, 'x')).toBe('x');
  });
  it('lists only what is allowed', () => {
    expect(acceptAttribute({ allowedTypes: ['images'] }, 'x')).toBe('image/*');
    expect(acceptAttribute({ allowedTypes: ['spreadsheets'] }, 'x')).toContain('.xlsx');
    expect(acceptAttribute({ allowedTypes: ['spreadsheets'] }, 'x')).not.toContain('image/*');
  });
});

import { DEFAULT_ATTACHMENT_SETTINGS, applyAttachmentSettings, attachmentSettingsFromOptions } from '../lib/attachmentRules';

describe('attachment settings', () => {
  it('reads defaults from empty options', () => {
    expect(attachmentSettingsFromOptions({})).toEqual(DEFAULT_ATTACHMENT_SETTINGS);
    expect(attachmentSettingsFromOptions(null)).toEqual(DEFAULT_ATTACHMENT_SETTINGS);
  });
  it('round trips and ignores unknown kinds', () => {
    const options = applyAttachmentSettings({ keep: 1 }, { maxCount: '3', maxSizeMB: '10', allowedTypes: ['images', 'audio'] });
    expect(options).toEqual({ keep: 1, maxCount: 3, maxSizeMB: 10, allowedTypes: ['images', 'audio'] });
    expect(attachmentSettingsFromOptions(options)).toEqual({ maxCount: '3', maxSizeMB: '10', allowedTypes: ['images', 'audio'] });
    expect(attachmentSettingsFromOptions({ allowedTypes: ['images', 'rocket'] }).allowedTypes).toEqual(['images']);
  });
  it('removes limits that are cleared and caps the size at 50 MB', () => {
    expect(applyAttachmentSettings({ maxCount: 3, maxSizeMB: 10, allowedTypes: ['images'] }, DEFAULT_ATTACHMENT_SETTINGS)).toEqual({});
    expect(applyAttachmentSettings({}, { maxCount: '', maxSizeMB: '500', allowedTypes: [] })).toEqual({ maxSizeMB: 50 });
    expect(applyAttachmentSettings({}, { maxCount: '-2', maxSizeMB: 'x', allowedTypes: [] })).toEqual({});
  });
});
