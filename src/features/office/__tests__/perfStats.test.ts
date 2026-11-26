import { beforeEach, describe, expect, it } from 'vitest';
import { countIn, countOut, perf, perfReadout, rollMessageRates, setSmooth, smoothNow } from '../world/perfStats';

describe('office performance numbers', () => {
  beforeEach(() => { perf.smooth = false; perf.autoSmooth = false; });
  it('turns message counts into per-second rates', () => {
    rollMessageRates(1000); // starts the clock
    for (let i = 0; i < 30; i++) countIn();
    for (let i = 0; i < 6; i++) countOut();
    rollMessageRates(3000); // two seconds later
    expect(perf.msgIn).toBe(15);
    expect(perf.msgOut).toBe(3);
  });
  it('Smooth mode is on by choice or by itself, and the readout says which', () => {
    expect(smoothNow()).toBe(false);
    setSmooth(true);
    expect(smoothNow()).toBe(true);
    expect(perfReadout()).toContain('Smooth mode on');
    setSmooth(false);
    perf.autoSmooth = true;
    expect(smoothNow()).toBe(true);
    expect(perfReadout()).toContain('on (by itself)');
  });
});

import { isSoftwareGraphics, perfVerdict } from '../world/perfStats';
describe('what the numbers mean', () => {
  it('knows software drawing from a real graphics card', () => {
    expect(isSoftwareGraphics('Google SwiftShader')).toBe(true);
    expect(isSoftwareGraphics('Microsoft Basic Render Driver')).toBe(true);
    expect(isSoftwareGraphics('NVIDIA GeForce GTX 1650 Direct3D11')).toBe(false);
    expect(isSoftwareGraphics('Intel(R) UHD Graphics 620')).toBe(false);
  });
  it('says the network is not the problem when messages are quiet and drawing is slow', () => {
    perf.workMs = 60; perf.msgIn = 0; perf.rtc = 0; perf.fps = 8;
    expect(perfVerdict().text).toMatch(/not the network|graphics acceleration/i);
    expect(perfVerdict().tone).toBe('bad');
  });
});
