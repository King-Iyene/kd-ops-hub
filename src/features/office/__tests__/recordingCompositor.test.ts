import { describe, expect, it } from 'vitest';
import { coverCrop, fitInside, layoutFrame } from '../calls/recordingCompositor';

describe('recording layout', () => {
  it('shows just the map when nothing is shared', () => {
    const l = layoutFrame(1280, 720, 0, 3);
    expect(l.strip).toEqual([]);
    expect(l.stage).toEqual([{ x: 0, y: 0, w: 1280, h: 720 }]);
  });
  it('puts everyone on top and the screen large beneath when a screen is shared', () => {
    const l = layoutFrame(1280, 720, 1, 3);
    expect(l.strip).toHaveLength(4); // the map and three cameras
    expect(l.strip.every((r) => r.y === 0)).toBe(true);
    expect(l.stage).toHaveLength(1);
    expect(l.stage[0].y).toBeGreaterThan(l.strip[0].h); // beneath the strip
    expect(l.stage[0].w).toBe(1280);
    expect(l.stage[0].y + l.stage[0].h).toBe(720);
  });
  it('shows two shared screens side by side, never more', () => {
    const l = layoutFrame(1280, 720, 3, 0);
    expect(l.stage).toHaveLength(2);
    expect(l.stage[1].x).toBeGreaterThan(l.stage[0].x + l.stage[0].w - 1);
  });
  it('does not run the strip off the frame when many cameras are on', () => {
    const l = layoutFrame(1280, 720, 1, 40);
    const last = l.strip[l.strip.length - 1];
    expect(last.x + last.w).toBeLessThanOrEqual(1280);
  });
});

describe('fitting pictures', () => {
  it('keeps the shape of a shared screen and centres it', () => {
    const r = fitInside(1920, 1080, { x: 0, y: 100, w: 1280, h: 600 });
    expect(r.h).toBe(600);
    expect(r.w).toBe(1067);
    expect(r.x).toBe(107);
  });
  it('fills a camera cell by cropping the overflow evenly', () => {
    const k = coverCrop(1280, 720, { x: 0, y: 0, w: 144, h: 108 });
    expect(k.sh).toBeCloseTo(720, 5);
    expect(k.sw).toBeCloseTo(960, 5);
    expect(k.sx).toBeCloseTo(160, 5);
  });
});
