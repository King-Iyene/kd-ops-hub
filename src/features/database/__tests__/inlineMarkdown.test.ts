import { describe, expect, it } from 'vitest';
import { hasInlineMarks, parseInline } from '../lib/inlineMarkdown';

describe('parseInline', () => {
  it('leaves plain text alone', () => {
    expect(parseInline('just words')).toEqual([{ kind: 'text', text: 'just words' }]);
    expect(parseInline('')).toEqual([]);
  });
  it('reads bold, italic, strike and code', () => {
    expect(parseInline('a **b** c')).toEqual([
      { kind: 'text', text: 'a ' }, { kind: 'bold', text: 'b' }, { kind: 'text', text: ' c' },
    ]);
    expect(parseInline('*x*')).toEqual([{ kind: 'italic', text: 'x' }]);
    expect(parseInline('~~gone~~')).toEqual([{ kind: 'strike', text: 'gone' }]);
    expect(parseInline('use `npm run build`')).toEqual([
      { kind: 'text', text: 'use ' }, { kind: 'code', text: 'npm run build' },
    ]);
  });
  it('handles several marks in a row', () => {
    expect(parseInline('**a** and *b*').map((p) => p.kind)).toEqual(['bold', 'text', 'italic']);
  });
  it('does not turn arithmetic or lone stars into italics', () => {
    expect(parseInline('2 * 3 * 4')).toEqual([{ kind: 'text', text: '2 * 3 * 4' }]);
    expect(parseInline('5 * 6')).toEqual([{ kind: 'text', text: '5 * 6' }]);
    expect(parseInline('a*b')).toEqual([{ kind: 'text', text: 'a*b' }]);
  });
  it('leaves an unclosed mark as text', () => {
    expect(parseInline('**open')).toEqual([{ kind: 'text', text: '**open' }]);
  });
  it('never produces markup from html', () => {
    const pieces = parseInline('<b>x</b> **y**');
    expect(pieces[0]).toEqual({ kind: 'text', text: '<b>x</b> ' });
  });
});

describe('hasInlineMarks', () => {
  it('is true only when something would change', () => {
    expect(hasInlineMarks('**x**')).toBe(true);
    expect(hasInlineMarks('plain')).toBe(false);
    expect(hasInlineMarks('2 * 3 * 4')).toBe(false);
  });
});
