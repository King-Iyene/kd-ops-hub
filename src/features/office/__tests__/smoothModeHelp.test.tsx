import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SMOOTH_MODE_HELP, SmoothModeHelp } from '../ProfileMenu';

afterEach(cleanup);

describe('Smooth mode explanation', () => {
  it('has an (i) button with a clear name that shows the explanation when focused', async () => {
    render(<SmoothModeHelp />);
    const btn = screen.getByRole('button', { name: 'What is Smooth mode?' });
    btn.focus();
    fireEvent.focus(btn);
    expect((await screen.findAllByText(SMOOTH_MODE_HELP[0])).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/30 times a second instead of 60/)).length).toBeGreaterThan(0);
  });
  it('says plainly what it does and when to use it, without claiming more than it does', () => {
    const all = SMOOTH_MODE_HELP.join(' ');
    expect(all).toMatch(/30 times a second instead of 60/);
    expect(all).toMatch(/slow or laggy/);
    expect(all).toMatch(/Leave it off on a good computer/);
    expect(all).toMatch(/turn itself on/);
    expect(all.toLowerCase()).not.toContain('weather'); // it does not switch the weather off
  });
});
