import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const req = createRequire(import.meta.url);
const { zoomFromInput, nextZoomLevel } = req(resolve(__dirname, '../../../../desktop-office/zoom-keys.js')) as {
  zoomFromInput: (i: Record<string, unknown>) => 'in' | 'out' | 'reset' | null;
  nextZoomLevel: (level: number, action: 'in' | 'out' | 'reset') => number;
};
const press = (o: Record<string, unknown>) => zoomFromInput({ type: 'keyDown', control: true, ...o });

describe('desktop app zoom keys', () => {
  it('zooms in with Ctrl and plus, with or without Shift (Ctrl+= and Ctrl+Shift+=)', () => {
    expect(press({ key: '=', code: 'Equal' })).toBe('in');
    expect(press({ key: '+', code: 'Equal', shift: true })).toBe('in');
    expect(press({ key: '+', code: 'NumpadAdd' })).toBe('in');
  });
  it('zooms OUT with Ctrl and minus, with or without Shift (Ctrl+- and Ctrl+Shift+-, which types an underscore)', () => {
    expect(press({ key: '-', code: 'Minus' })).toBe('out');
    expect(press({ key: '_', code: 'Minus', shift: true })).toBe('out');
    expect(press({ key: '-', code: 'NumpadSubtract' })).toBe('out');
  });
  it('goes back to normal size with Ctrl and zero', () => {
    expect(press({ key: '0', code: 'Digit0' })).toBe('reset');
    expect(press({ key: '0', code: 'Numpad0' })).toBe('reset');
  });
  it('works with Cmd on a Mac', () => {
    expect(zoomFromInput({ type: 'keyDown', meta: true, key: '-', code: 'Minus' })).toBe('out');
  });
  it('ignores everything else: no Ctrl, releasing the key, Alt held (AltGr), other keys', () => {
    expect(zoomFromInput({ type: 'keyDown', key: '-', code: 'Minus' })).toBeNull();
    expect(zoomFromInput({ type: 'keyUp', control: true, key: '-', code: 'Minus' })).toBeNull();
    expect(press({ key: '-', code: 'Minus', alt: true })).toBeNull();
    expect(press({ key: 'a', code: 'KeyA' })).toBeNull();
    expect(zoomFromInput(undefined as never)).toBeNull();
  });
  it('steps by half a level and stays between -3 and 4', () => {
    expect(nextZoomLevel(0, 'in')).toBe(0.5);
    expect(nextZoomLevel(0, 'out')).toBe(-0.5);
    expect(nextZoomLevel(4, 'in')).toBe(4);
    expect(nextZoomLevel(-3, 'out')).toBe(-3);
    expect(nextZoomLevel(2.5, 'reset')).toBe(0);
  });
});
