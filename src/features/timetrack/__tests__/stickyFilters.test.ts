import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STICKY_FILTERS } from '../ui/stickyFilters';

/**
 * The date / people filter bar of a Time Track page must stay in view while the page scrolls. It was once marked "sticky" and still scrolled
 * away: a sticky bar only sticks to the nearest box that really scrolls, and the app layout's content box (main) grows with its content (the
 * browser window scrolls, not that box), so nothing ever stuck. Checked in a real browser: the bar left the screen 1364 px up; with the box
 * no longer a scrolling box in Time Track it stays right under the header. These tests keep both halves in place.
 */
describe('Time Track filter bar stays in view', () => {
  it('sticks just under the 3.5rem header, below it in stacking order', () => {
    expect(STICKY_FILTERS).toMatch(/\bsticky\b/);
    expect(STICKY_FILTERS).toMatch(/\btop-14\b/);
    expect(STICKY_FILTERS).toMatch(/\bz-10\b/);
    expect(STICKY_FILTERS).not.toMatch(/\btop-0\b/);
  });
  it('the layout does not make the content box a scrolling box inside Time Track', () => {
    const layout = readFileSync(resolve(__dirname, '../../../components/AppLayout.tsx'), 'utf8');
    expect(layout).toMatch(/pathname\.startsWith\('\/timetrack'\) \? 'overflow-visible' : 'overflow-auto'/);
    expect(layout).toMatch(/header[\s\S]{0,400}h-14[\s\S]{0,200}sticky top-0 z-20/); // the header it pins under
  });
});
