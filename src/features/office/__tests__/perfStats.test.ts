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
