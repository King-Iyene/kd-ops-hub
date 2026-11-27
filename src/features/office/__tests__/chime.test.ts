import { afterEach, describe, expect, it, vi } from 'vitest';
import { RING_FIGURE, RING_REPEAT_AT, WAVE_FIGURE, playRing, playWave } from '../chime';

afterEach(() => vi.unstubAllGlobals());

/** notes of the major pentatonic scale on C (any octave), so the tune has no sour note */
const PENTATONIC = [0, 2, 4, 7, 9];
const pitchClass = (hz: number) => ((Math.round(12 * Math.log2(hz / 261.63)) % 12) + 12) % 12;

describe('the wave and ring sounds', () => {
  it('are made only of calm notes (major pentatonic) and rise, so they sound friendly', () => {
    for (const fig of [RING_FIGURE, WAVE_FIGURE]) {
      for (const [hz] of fig) expect(PENTATONIC).toContain(pitchClass(hz));
      for (let i = 1; i < fig.length; i++) { expect(fig[i][0]).toBeGreaterThan(fig[i - 1][0]); expect(fig[i][1]).toBeGreaterThan(fig[i - 1][1]); }
    }
    expect(RING_REPEAT_AT).toBeGreaterThan(RING_FIGURE[RING_FIGURE.length - 1][1]); // the second round starts after the first
  });

  it('do nothing and do not throw when sound is blocked', () => {
    vi.stubGlobal('AudioContext', undefined);
    expect(() => { playRing(); playWave(); }).not.toThrow();
  });

  it('are played through a compressor and a limiter, with every note a bell of several partials', () => {
    const made = { osc: 0, comp: 0 };
    const node = () => ({ connect: vi.fn(), gain: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, delayTime: { value: 0 }, frequency: { value: 0 }, detune: { value: 0 }, start: vi.fn(), stop: vi.fn(), type: '' });
    class Ctx {
      currentTime = 0; destination = {};
      createGain = node; createDelay = node; createBiquadFilter = node;
      createOscillator() { made.osc++; return node(); }
      createDynamicsCompressor() { made.comp++; return { ...node(), threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 }, attack: { value: 0 }, release: { value: 0 } }; }
      close = vi.fn();
    }
    vi.stubGlobal('AudioContext', Ctx);
    vi.useFakeTimers();
    playWave();
    expect(made.comp).toBe(2); // the compressor and a final limiter
    expect(made.osc).toBe(WAVE_FIGURE.length * 10); // 5 partials, each doubled for a soft shimmer
    playRing();
    expect(made.osc).toBe(WAVE_FIGURE.length * 10 + RING_FIGURE.length * 2 * 10); // two rounds
    vi.useRealTimers();
  });
});
