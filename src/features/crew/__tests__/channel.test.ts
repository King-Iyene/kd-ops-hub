import { describe, expect, it } from 'vitest';
import { mentionsIn } from '../components/ChannelTab';

const team = [{ id: 'cfo', name: 'Hale King' }, { id: 'comp', name: 'Joan Prescott' }, { id: 'fin', name: 'Charles Bennett' }];

describe('the team channel: tagging people', () => {
  it('finds each executive tagged by first name, once, whatever the case', () => {
    expect(mentionsIn('@Hale ask @joan about the VAT, and @HALE again', team)).toEqual(['cfo', 'comp']);
  });
  it('ignores names that are not on the team and plain text', () => {
    expect(mentionsIn('@Nobody please look; email me@example.com', team)).toEqual([]);
    expect(mentionsIn('no tags here', team)).toEqual([]);
  });
  it('takes a tag followed by punctuation', () => {
    expect(mentionsIn('Thanks @Charles, and @Joan.', team)).toEqual(['fin', 'comp']);
  });
});
