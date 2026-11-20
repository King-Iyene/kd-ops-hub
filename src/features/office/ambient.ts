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

/** How a step sounds on each kind of floor: how bright, how loud, how long. */
export const SURFACES: Record<string, { lp: number; peak: number; len: number }> = {
  wood: { lp: 520, peak: 0.08, len: 0.09 },
  stone: { lp: 1500, peak: 0.085, len: 0.06 },
  carpet: { lp: 170, peak: 0.045, len: 0.11 },
  grass: { lp: 760, peak: 0.05, len: 0.13 },
  gray: { lp: 430, peak: 0.065, len: 0.08 },
  sand: { lp: 360, peak: 0.05, len: 0.15 },
};

/** The hum of each room: a filtered murmur, a soft pad, or the bleeps of the arcade. */
export const ROOM_TONES: Record<string, { murmur: number; murmurHz: number; pad: number; blips: boolean }> = {
  library: { murmur: 0.012, murmurHz: 160, pad: 0, blips: false },
  game: { murmur: 0.02, murmurHz: 900, pad: 0, blips: true },
  wellness: { murmur: 0.006, murmurHz: 140, pad: 0.03, blips: false },
  workshop: { murmur: 0.022, murmurHz: 520, pad: 0, blips: false },
  hall: { murmur: 0.018, murmurHz: 420, pad: 0, blips: false },
  lounge: { murmur: 0.022, murmurHz: 600, pad: 0, blips: false },
  reception: { murmur: 0.016, murmurHz: 480, pad: 0, blips: false },
  auditorium: { murmur: 0.014, murmurHz: 380, pad: 0, blips: false },
};

class Ambient {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private layers = new Map<Kind, Layer>();
  private timers: number[] = [];
  private weatherGain: GainNode | null = null;
  private motor: { osc: OscillatorNode; gain: GainNode } | null = null;
  private windGain: GainNode | null = null;
  private enabled = true;
  private volume = 0.8;
  private lastUpdate = 0;
  private lastStep = 0;
  private stepSide = 1;
  private surface = 'wood';
  private room: string | null = null;
  private roomMurmur: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private pad: GainNode | null = null;
  private blipTimer: number | null = null;

  /** the overall loudness of every office sound (0 to 1) */
  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(this.quiet ? 0 : 1.1 * this.volume, this.ctx.currentTime, 0.1);
  }

  /** Hush the office's own sounds (footsteps, rooms, weather) while the desktop app is hidden. Calls and notifications are not affected. */
  private quiet = false;
  setQuiet(on: boolean) {
    this.quiet = on;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(on ? 0 : 1.1 * this.volume, this.ctx.currentTime, 0.15);
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on) this.stop();
  }

  /** what is under my feet (wood, stone, carpet, grass, gray, sand): it changes how footsteps sound */
  setSurface(kind: string) {
    this.surface = SURFACES[kind] ? kind : 'wood';
  }

  /** the room I am in: each has its own quiet background (a library is hushed, the game room bleeps) */
  setRoom(id: string | null) {
    this.room = id;
    const c = this.ctx;
    const tone = id ? ROOM_TONES[id] : undefined;
    if (c && this.roomMurmur) {
      this.roomMurmur.gain.gain.setTargetAtTime(tone?.murmur ?? 0, c.currentTime, 0.8);
      if (tone) this.roomMurmur.filter.frequency.setTargetAtTime(tone.murmurHz, c.currentTime, 0.5);
    }
    if (c && this.pad) this.pad.gain.setTargetAtTime(tone?.pad ?? 0, c.currentTime, 1.5);
    if (this.blipTimer !== null) { window.clearTimeout(this.blipTimer); this.blipTimer = null; }
    if (tone?.blips) {
      const loop = () => {
        this.blip();
        this.blipTimer = window.setTimeout(loop, 600 + Math.random() * 1700);
      };
      this.blipTimer = window.setTimeout(loop, 900);
    }
  }

  private blip() {
    const c = this.ctx;
    if (!this.enabled || !c || !this.master || c.state !== 'running') return;
    const base = [440, 523, 659, 784, 988][Math.floor(Math.random() * 5)];
    for (let k = 0; k < 2; k++) {
      const t = c.currentTime + k * 0.07;
      const o = c.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(base * (k ? 1.5 : 1), t);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.018, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + 0.1);
    }
  }

  /** three knocks on a door */
  knock() {
    const c = this.ctx;
    if (!this.enabled || !c || !this.noise || !this.master || c.state !== 'running') return;
    for (let k = 0; k < 3; k++) {
      const t = c.currentTime + k * 0.16 + (k === 2 ? 0.05 : 0);
      const n = c.createBufferSource();
      n.buffer = this.noise;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 320;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.32, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
      n.connect(lp);
      lp.connect(g);
      g.connect(this.master);
      n.start(t, Math.random(), 0.14);
    }
  }

  /** a friendly little two-note chime for a wave */
  wave() {
    const c = this.ctx;
    if (!this.enabled || !c || !this.master || c.state !== 'running') return;
    for (const [k, f] of [[0, 659], [1, 880]] as const) {
      const t = c.currentTime + k * 0.12;
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f, t);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + 0.55);
    }
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
    this.motor = null;
    this.roomMurmur = null;
    this.pad = null;
    if (this.blipTimer !== null) { window.clearTimeout(this.blipTimer); this.blipTimer = null; }
    const c = this.ctx;
    this.ctx = null;
    this.master = null;
    this.noise = null;
    if (c) void c.close().catch(() => undefined);
  }

  update(me: { x: number; y: number }, items: Item[], moving: boolean, now: number, riding = false) {
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

    // a quiet electric hum while you ride
    if (this.motor) {
      this.motor.gain.gain.setTargetAtTime(riding && moving ? 0.045 : 0, c.currentTime, 0.12);
      this.motor.osc.frequency.setTargetAtTime(riding && moving ? 118 : 80, c.currentTime, 0.2);
    }

    // soft footsteps while you walk (one about every stride)
    if (moving && !riding && now - this.lastStep > 340) {
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

  /** a deep gong: a low tone with a few inharmonic partials that ring and fade over a few seconds */
  gong() {
    if (!this.enabled) return;
    const c = this.ensure();
    if (!c || !this.master || c.state !== 'running') return;
    const now = c.currentTime;
    for (const [mul, peak, len] of [[1, 0.28, 3.4], [1.51, 0.14, 2.6], [2.03, 0.1, 2.0], [2.76, 0.06, 1.4], [4.1, 0.03, 0.9]] as const) {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(110 * mul, now);
      o.frequency.exponentialRampToValueAtTime(106 * mul, now + len);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(peak, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + len);
      o.connect(g);
      g.connect(this.master);
      o.start(now);
      o.stop(now + len + 0.05);
    }
  }

  /**
   * One animal call made the way a real throat makes it: a buzzing source (the voice box) pushed through
   * moving resonances (the mouth), with a little breath on top. f0 / f1 / f2 are [seconds, hertz] paths.
   */
  private call(
    c: AudioContext, out: AudioNode, t: number,
    o: { dur: number; f0: [number, number][]; f1: [number, number][]; f2: [number, number][]; peak: number; attack: number; breath: number; vib?: number; vibHz?: number; growl?: number },
  ) {
    const path = (p: AudioParam, pts: [number, number][]) => {
      p.setValueAtTime(pts[0][1], t + pts[0][0]);
      for (let i = 1; i < pts.length; i++) p.linearRampToValueAtTime(pts[i][1], t + pts[i][0]);
    };
    const amp = c.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(o.peak, t + o.attack);
    amp.gain.setValueAtTime(o.peak, t + Math.max(o.attack, o.dur * 0.55));
    amp.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    // the voice box: a buzz rich in harmonics
    const src = c.createOscillator();
    src.type = 'sawtooth';
    path(src.frequency, o.f0);
    if (o.vib) {
      const v = c.createOscillator();
      v.frequency.value = o.vibHz ?? 6;
      const vg = c.createGain();
      vg.gain.value = o.vib;
      v.connect(vg);
      vg.connect(src.frequency);
      v.start(t);
      v.stop(t + o.dur + 0.05);
    }
    // a growl is the buzz being chopped fast
    const buzz = c.createGain();
    buzz.gain.value = 1;
    if (o.growl) {
      const g = c.createOscillator();
      g.frequency.value = o.growl;
      const gd = c.createGain();
      gd.gain.value = 0.45;
      g.connect(gd);
      gd.connect(buzz.gain);
      g.start(t);
      g.stop(t + o.dur + 0.05);
    }
    src.connect(buzz);
    // breath and rasp
    const n = c.createBufferSource();
    n.buffer = this.noise;
    const ng = c.createGain();
    ng.gain.value = o.breath;
    n.connect(ng);
    // the mouth: two or three resonances that move as the mouth opens and closes
    const mouth = c.createGain();
    mouth.gain.value = 1;
    const formant = (pts: [number, number][], q: number, level: number) => {
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = q;
      path(f.frequency, pts);
      const g = c.createGain();
      g.gain.value = level;
      buzz.connect(f);
      ng.connect(f);
      f.connect(g);
      g.connect(mouth);
    };
    formant(o.f1, 5, 1.6);
    formant(o.f2, 7, 1.1);
    formant([[0, 3300], [o.dur, 3000]], 8, 0.35);
    // a touch of the throat's own low body
    const body = c.createBiquadFilter();
    body.type = 'lowpass';
    body.frequency.value = 900;
    buzz.connect(body);
    const bodyG = c.createGain();
    bodyG.gain.value = 0.18;
    body.connect(bodyG);
    bodyG.connect(mouth);
    mouth.connect(amp);
    amp.connect(out);
    src.start(t);
    src.stop(t + o.dur + 0.05);
    n.start(t, Math.random() * 1.5, o.dur + 0.05);
  }

  /** a bark, a meow, or a happy purr or yip. `pitch` makes each animal its own: below 1 is bigger, above 1 is smaller. */
  pet(kind: 'dog' | 'cat', sound: 'bark' | 'meow' | 'happy', volume = 1, pitch = 1) {
    if (!this.enabled) return;
    const c = this.ensure();
    if (!c || !this.master || !this.noise || c.state !== 'running') return;
    // a quieter voice for a pet that is further away
    const bus = c.createGain();
    bus.gain.value = Math.max(0, Math.min(1, volume));
    bus.connect(this.master);
    const out: AudioNode = bus;
    const now = c.currentTime + 0.01;
    const jitter = () => 0.94 + Math.random() * 0.12;
    if (kind === 'dog') {
      if (sound === 'happy') {
        // excited yips: quick, high, a little breathless
        const n = 3 + (Math.random() < 0.5 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const t = now + i * (0.16 + Math.random() * 0.04);
          const f = 640 * pitch * jitter() * (1 + i * 0.03);
          this.call(c, out, t, {
            dur: 0.12, peak: 0.34, attack: 0.006, breath: 0.12,
            f0: [[0, f * 0.8], [0.03, f * 1.12], [0.12, f * 0.82]],
            f1: [[0, 700], [0.05, 1000], [0.12, 780]],
            f2: [[0, 1700], [0.05, 2200], [0.12, 1800]],
          });
        }
        return;
      }
      // a proper woof: a sharp start, a gravelly middle, a quick fall; two or three, each a little different
      const n = Math.random() < 0.4 ? 3 : 2;
      let t = now;
      for (let i = 0; i < n; i++) {
        const f = 330 * pitch * jitter() * (1 - i * 0.04);
        const len = 0.17 + Math.random() * 0.05;
        this.call(c, out, t, {
          dur: len, peak: 0.5 - i * 0.07, attack: 0.007, breath: 0.2, growl: 70 + Math.random() * 25,
          f0: [[0, f * 1.18], [0.025, f * 1.3], [len, f * 0.7]],
          f1: [[0, 560], [0.04, 880], [len, 560]],
          f2: [[0, 1250], [0.04, 1650], [len, 1100]],
        });
        t += len + 0.12 + Math.random() * 0.1;
      }
      return;
    }
    if (sound === 'happy') {
      // a purr: a low rumble, chopped about 25 times a second, that swells and fades
      const nz = c.createBufferSource();
      nz.buffer = this.noise;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 240;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.5, now + 0.3);
      g.gain.setValueAtTime(0.5, now + 1.1);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 2);
      const lfo = c.createOscillator();
      lfo.frequency.value = 24 + Math.random() * 3;
      const depth = c.createGain();
      depth.gain.value = 0.3;
      lfo.connect(depth);
      depth.connect(g.gain);
      const hum = c.createOscillator();
      hum.type = 'triangle';
      hum.frequency.value = 52 * pitch;
      const hg = c.createGain();
      hg.gain.value = 0.15;
      hum.connect(hg);
      hg.connect(g);
      nz.connect(lp);
      lp.connect(g);
      g.connect(out);
      nz.start(now, 0, 2.1);
      lfo.start(now);
      hum.start(now);
      lfo.stop(now + 2.1);
      hum.stop(now + 2.1);
      return;
    }
    // a meow, "mee-ow": it starts closed and nasal, opens and climbs, then slides down and closes
    const f = 520 * pitch * jitter();
    const len = 0.72 + Math.random() * 0.18;
    this.call(c, out, now, {
      dur: len, peak: 0.42, attack: 0.09, breath: 0.1, vib: 7, vibHz: 6.5,
      f0: [[0, f * 0.82], [len * 0.25, f * 1.22], [len * 0.55, f * 1.1], [len, f * 0.7]],
      f1: [[0, 420], [len * 0.25, 760], [len * 0.7, 640], [len, 480]],
      f2: [[0, 2300], [len * 0.25, 2000], [len * 0.7, 1300], [len, 1000]],
    });
  }

  // ---- building blocks --------------------------------------------------------

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      const c = new AudioContext();
      this.ctx = c;
      const master = c.createGain();
      master.gain.value = this.quiet ? 0 : 1.1 * this.volume;
      master.connect(c.destination);
      this.master = master;

      // two seconds of noise, looped, is the raw material for water, fire and footsteps
      const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buf;

      this.buildWeather(c);
      {
        const osc = c.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 80;
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 340;
        const gain = c.createGain();
        gain.gain.value = 0;
        osc.connect(lp);
        lp.connect(gain);
        gain.connect(master);
        osc.start();
        this.motor = { osc, gain };
      }
      this.buildWater(c);
      this.buildFire(c);
      this.buildTank(c);
      this.buildMusic(c);
      // the room tone: a murmur through a filter, and a soft two-note pad
      {
        const n = c.createBufferSource();
        n.buffer = this.noise;
        n.loop = true;
        const filter = c.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 400;
        const gain = c.createGain();
        gain.gain.value = 0;
        n.connect(filter);
        filter.connect(gain);
        gain.connect(master);
        n.start();
        this.roomMurmur = { gain, filter };
        const pad = c.createGain();
        pad.gain.value = 0;
        pad.connect(master);
        for (const f of [196, 294.5]) { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(pad); o.start(); }
        this.pad = pad;
        // the room I am already in
        if (this.room && ROOM_TONES[this.room]) { gain.gain.value = ROOM_TONES[this.room].murmur; filter.frequency.value = ROOM_TONES[this.room].murmurHz; pad.gain.value = ROOM_TONES[this.room].pad; }
      }
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
    const sf = SURFACES[this.surface] ?? SURFACES.wood;
    lp.frequency.value = sf.lp * (0.92 + Math.random() * 0.16);
    const e = c.createGain();
    const p = c.createStereoPanner();
    p.pan.value = side * 0.12;
    const t = c.currentTime;
    e.gain.setValueAtTime(0.0001, t);
    e.gain.exponentialRampToValueAtTime(sf.peak, t + 0.008);
    e.gain.exponentialRampToValueAtTime(0.0001, t + sf.len);
    n.connect(lp);
    lp.connect(e);
    e.connect(p);
    p.connect(this.master);
    n.start(t, Math.random() * 1.5, 0.12);
  }
}

export const ambient = new Ambient();
