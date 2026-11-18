import type { Item } from './world/types';
import { ITEM_DEFS } from './world/world';

/**
 * The sound of the place. Everything is made in the browser (nothing is downloaded) and it gets louder as you
 * walk toward its source and fades as you walk away, shifting left or right to match where it is:
 *   fountain  -> running water      fireplace -> a low crackle      fish tank -> soft bubbles
 *   piano and speakers -> gentle, never-repeating notes             you -> soft footsteps
 */
type Kind = 'water' | 'fire' | 'tank' | 'music';

const SOURCES: Partial<Record<string, { kind: Kind; range: number }>> = {
  fountain: { kind: 'water', range: 8 },
  fireplace: { kind: 'fire', range: 6 },
  fishtank: { kind: 'tank', range: 4.5 },
  piano: { kind: 'music', range: 7 },
  speaker: { kind: 'music', range: 8 },
};
const LOUDEST: Record<Kind, number> = { water: 0.5, fire: 0.42, tank: 0.3, music: 0.34 };

/** 0 (silent, out of range) to 1 (right next to it), falling off smoothly */
export function soundLevel(distance: number, range: number): number {
  if (!(range > 0) || !(distance >= 0)) return 0;
  const k = Math.max(0, 1 - distance / range);
  return Math.pow(k, 1.6);
}

interface Layer { gain: GainNode; pan: StereoPannerNode; level: number }

class Ambient {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private layers = new Map<Kind, Layer>();
  private timers: number[] = [];
  private weatherGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private enabled = true;
  private lastUpdate = 0;
  private lastStep = 0;
  private stepSide = 1;

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on) this.stop();
  }

  /** call from a click or key press (browsers only allow sound after one) */
  resume() {
    if (!this.enabled) return;
    const c = this.ensure();
    if (c && c.state === 'suspended') void c.resume();
  }

  stop() {
    for (const t of this.timers) window.clearTimeout(t);
    this.timers = [];
    this.layers.clear();
    const c = this.ctx;
    this.ctx = null;
    this.master = null;
    this.noise = null;
    if (c) void c.close().catch(() => undefined);
  }

  update(me: { x: number; y: number }, items: Item[], moving: boolean, now: number) {
    if (!this.enabled || now - this.lastUpdate < 100) return;
    this.lastUpdate = now;
    const c = this.ctx;
    if (!c || c.state !== 'running') return;

    const best = new Map<Kind, { d: number; x: number; range: number }>();
    for (const it of items) {
      const src = SOURCES[it.t];
      if (!src) continue;
      const def = ITEM_DEFS[it.t];
      const rotated = (it.r ?? 0) % 2 === 1;
      const cx = it.x + (rotated ? def.h : def.w) / 2;
      const cy = it.y + (rotated ? def.w : def.h) / 2;
      const d = Math.hypot(cx - me.x, cy - me.y);
      const cur = best.get(src.kind);
      if (!cur || d < cur.d) best.set(src.kind, { d, x: cx, range: src.range });
    }
    for (const kind of ['water', 'fire', 'tank', 'music'] as Kind[]) {
      const layer = this.layers.get(kind);
      if (!layer) continue;
      const b = best.get(kind);
      const level = b ? soundLevel(b.d, b.range) * LOUDEST[kind] : 0;
      layer.level = level;
      layer.gain.gain.setTargetAtTime(level, c.currentTime, 0.2);
      layer.pan.pan.setTargetAtTime(b ? Math.max(-1, Math.min(1, (b.x - me.x) / b.range)) * 0.7 : 0, c.currentTime, 0.2);
    }

    // soft footsteps while you walk (one about every stride)
    if (moving && now - this.lastStep > 340) {
      this.lastStep = now;
      this.stepSide = -this.stepSide;
      this.footstep(this.stepSide);
    }
  }

  /** rain (0 to 1) and dusty Harmattan wind (0 to 1); the same everywhere in the office */
  setWeather(rain: number, wind: number) {
    const c = this.ctx;
    if (!this.enabled || !c || !this.weatherGain || !this.windGain) return;
    this.weatherGain.gain.setTargetAtTime(0.17 * rain, c.currentTime, 0.6);
    this.windGain.gain.setTargetAtTime(0.1 * wind, c.currentTime, 1.2);
  }

  /** a roll of thunder a moment after a flash */
  thunder() {
    const c = this.ctx;
    if (!this.enabled || !c || !this.noise || !this.master || c.state !== 'running') return;
    const n = c.createBufferSource();
    n.buffer = this.noise;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 170;
    const e = c.createGain();
    const t = c.currentTime + 0.5 + Math.random() * 0.9;
    e.gain.setValueAtTime(0.0001, t);
    e.gain.exponentialRampToValueAtTime(0.55, t + 0.25);
    e.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
    n.connect(lp);
    lp.connect(e);
    e.connect(this.master);
    n.start(t, Math.random() * 1.2, 2.8);
  }

  private buildWeather(c: AudioContext) {
    const rain = this.loop(c);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1100;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 7500;
    const rg = c.createGain();
    rg.gain.value = 0;
    rain.connect(hp);
    hp.connect(lp);
    lp.connect(rg);
    rg.connect(this.master!);
    rain.start();
    this.weatherGain = rg;
    const wind = this.loop(c);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 420;
    bp.Q.value = 0.7;
    const wg = c.createGain();
    wg.gain.value = 0;
    const gust = c.createOscillator();
    gust.frequency.value = 0.12;
    const gustDepth = c.createGain();
    gustDepth.gain.value = 120;
    gust.connect(gustDepth);
    gustDepth.connect(bp.frequency);
    wind.connect(bp);
    bp.connect(wg);
    wg.connect(this.master!);
    wind.start();
    gust.start();
    this.windGain = wg;
  }

  // ---- building blocks --------------------------------------------------------

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      const c = new AudioContext();
      this.ctx = c;
      const master = c.createGain();
      master.gain.value = 0.9;
      master.connect(c.destination);
      this.master = master;

      // two seconds of noise, looped, is the raw material for water, fire and footsteps
      const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buf;

      this.buildWeather(c);
      this.buildWater(c);
      this.buildFire(c);
      this.buildTank(c);
      this.buildMusic(c);
      return c;
    } catch {
      return null;
    }
  }

  private layer(c: AudioContext, kind: Kind): Layer {
    const gain = c.createGain();
    gain.gain.value = 0;
    const pan = c.createStereoPanner();
    gain.connect(pan);
    pan.connect(this.master!);
    const l = { gain, pan, level: 0 };
    this.layers.set(kind, l);
    return l;
  }

  private loop(c: AudioContext): AudioBufferSourceNode {
    const s = c.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.loopStart = Math.random() * 1.5;
    return s;
  }

  private every(min: number, max: number, fn: () => void) {
    const tick = () => {
      if (!this.ctx) return;
      fn();
      this.timers.push(window.setTimeout(tick, min + Math.random() * (max - min)));
    };
    this.timers.push(window.setTimeout(tick, min + Math.random() * (max - min)));
  }

  private buildWater(c: AudioContext) {
    const L = this.layer(c, 'water');
    // a rush of high noise whose loudness drifts slowly, like water falling in a basin
    const hi = this.loop(c);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1700;
    bp.Q.value = 0.45;
    const hiGain = c.createGain();
    hiGain.gain.value = 0.55;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.37;
    const lfoDepth = c.createGain();
    lfoDepth.gain.value = 0.18;
    lfo.connect(lfoDepth);
    lfoDepth.connect(hiGain.gain);
    hi.connect(bp);
    bp.connect(hiGain);
    hiGain.connect(L.gain);
    // and a softer, deeper body underneath
    const lo = this.loop(c);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    const loGain = c.createGain();
    loGain.gain.value = 0.35;
    lo.connect(lp);
    lp.connect(loGain);
    loGain.connect(L.gain);
    hi.start();
    lo.start();
    lfo.start();
    // a few splashes
    this.every(220, 900, () => {
      if (L.level < 0.02) return;
      this.blip(c, L.gain, 900 + Math.random() * 1400, 0.025, 0.05 + Math.random() * 0.05, false);
    });
  }

  private buildFire(c: AudioContext) {
    const L = this.layer(c, 'fire');
    const rumble = this.loop(c);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const g = c.createGain();
    g.gain.value = 0.5;
    rumble.connect(lp);
    lp.connect(g);
    g.connect(L.gain);
    rumble.start();
    this.every(70, 380, () => {
      if (L.level < 0.02) return;
      // a pop or crackle
      const n = c.createBufferSource();
      n.buffer = this.noise;
      const hp = c.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1800 + Math.random() * 2200;
      const e = c.createGain();
      const t = c.currentTime;
      e.gain.setValueAtTime(0.0001, t);
      e.gain.exponentialRampToValueAtTime(0.5 + Math.random() * 0.5, t + 0.004);
      e.gain.exponentialRampToValueAtTime(0.0001, t + 0.03 + Math.random() * 0.05);
      n.connect(hp);
      hp.connect(e);
      e.connect(L.gain);
      n.start(t, Math.random() * 1.5, 0.12);
    });
  }

  private buildTank(c: AudioContext) {
    const L = this.layer(c, 'tank');
    const body = this.loop(c);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 640;
    const g = c.createGain();
    g.gain.value = 0.22;
    body.connect(lp);
    lp.connect(g);
    g.connect(L.gain);
    body.start();
    this.every(350, 1500, () => {
      if (L.level < 0.02) return;
      this.blip(c, L.gain, 420 + Math.random() * 420, 0.09, 0.22, true);
    });
  }

  private buildMusic(c: AudioContext) {
    const L = this.layer(c, 'music');
    // a little echo so the notes ring out
    const echo = c.createDelay(1);
    echo.delayTime.value = 0.34;
    const fb = c.createGain();
    fb.gain.value = 0.36;
    const tone = c.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2600;
    echo.connect(tone);
    tone.connect(fb);
    fb.connect(echo);
    tone.connect(L.gain);
    const scale = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33];
    let last = 2;
    this.every(900, 2700, () => {
      if (L.level < 0.02) return;
      // wander up or down the scale, a note or two at a time
      last = Math.max(0, Math.min(scale.length - 1, last + Math.round((Math.random() - 0.5) * 4)));
      const f = scale[last] * (Math.random() < 0.2 ? 0.5 : 1);
      const t = c.currentTime;
      for (const [mult, amp] of [[1, 0.5], [2.003, 0.16], [3.01, 0.06]] as const) {
        const o = c.createOscillator();
        const e = c.createGain();
        o.type = 'sine';
        o.frequency.value = f * mult;
        e.gain.setValueAtTime(0.0001, t);
        e.gain.exponentialRampToValueAtTime(amp, t + 0.008);
        e.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
        o.connect(e);
        e.connect(L.gain);
        e.connect(echo);
        o.start(t);
        o.stop(t + 1.9);
      }
    });
  }

  private blip(c: AudioContext, out: AudioNode, freq: number, dur: number, amp: number, rising: boolean) {
    const o = c.createOscillator();
    const e = c.createGain();
    const t = c.currentTime;
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (rising) o.frequency.exponentialRampToValueAtTime(freq * 1.8, t + dur);
    e.gain.setValueAtTime(0.0001, t);
    e.gain.exponentialRampToValueAtTime(amp, t + 0.01);
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    o.connect(e);
    e.connect(out);
    o.start(t);
    o.stop(t + dur + 0.1);
  }

  private footstep(side: number) {
    const c = this.ctx;
    if (!c || !this.noise || !this.master) return;
    const n = c.createBufferSource();
    n.buffer = this.noise;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 240 + Math.random() * 60;
    const e = c.createGain();
    const p = c.createStereoPanner();
    p.pan.value = side * 0.12;
    const t = c.currentTime;
    e.gain.setValueAtTime(0.0001, t);
    e.gain.exponentialRampToValueAtTime(0.07, t + 0.008);
    e.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);
    n.connect(lp);
    lp.connect(e);
    e.connect(p);
    p.connect(this.master);
    n.start(t, Math.random() * 1.5, 0.12);
  }
}

export const ambient = new Ambient();
