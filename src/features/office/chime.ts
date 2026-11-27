/**
 * A soft, ambient two-note bell for "someone is ringing you" (instead of a plain beep).
 * Built from a few gentle sine partials with a slow fade and a little echo, so it feels like a
 * reception chime. Nothing is downloaded; if sound is blocked it silently does nothing.
 */
export function playChime(volume = 0.16): void {
  try {
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = volume;

    // a soft echo so the notes bloom instead of stopping dead
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.21;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.34;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2400;
    master.connect(ctx.destination);
    master.connect(delay);
    delay.connect(tone);
    tone.connect(feedback);
    feedback.connect(delay);
    tone.connect(ctx.destination);

    const note = (freq: number, at: number) => {
      const t = ctx.currentTime + at;
      const partials: [number, number][] = [[1, 1], [2.01, 0.28], [3.98, 0.1]];
      for (const [mult, amp] of partials) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = freq * mult;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(amp, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
        o.connect(g);
        g.connect(master);
        o.start(t);
        o.stop(t + 1.7);
      }
    };
    note(659.25, 0); // E5
    note(987.77, 0.22); // B5
    window.setTimeout(() => void ctx.close(), 4200);
  } catch {
    /* no sound is fine */
  }
}

/** A phrase of soft, wistful bell notes (a sine with two quieter overtones, a slow fade and an echo). Nothing is downloaded. */
function phrase(notes: [number, number][], volume: number, ring = 2.4): void {
  try {
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = volume;
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.32;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2200;
    master.connect(ctx.destination);
    master.connect(delay);
    delay.connect(tone);
    tone.connect(fb);
    fb.connect(delay);
    tone.connect(ctx.destination);
    for (const [freq, at] of notes) {
      const t = ctx.currentTime + at;
      for (const [mult, amp] of [[1, 1], [2, 0.3], [3.01, 0.1]] as [number, number][]) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = freq * mult;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(amp, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + ring);
        o.connect(g);
        g.connect(master);
        o.start(t);
        o.stop(t + ring + 0.1);
      }
    }
    window.setTimeout(() => void ctx.close(), (notes[notes.length - 1][1] + ring + 1.5) * 1000);
  } catch {
    /* no sound is fine */
  }
}

// ---- the wave and ring sounds: warm bells, calm but loud ----
// Calm: a major-pentatonic tune (no sour notes), a soft start, a long gentle fade and a slow echo.
// Loud: each note is a bell with a low hum and bright overtones so it cuts through a room and speakers, and a compressor
// lifts the whole phrase without it ever clipping. Nothing is downloaded; if sound is blocked it silently does nothing.

/** [pitch in Hz, seconds after the start] */
export type BellNote = [number, number];

/** Somebody is ringing you: a rising bell figure (C, E, G, high C), played twice, the second time a little softer. */
export const RING_FIGURE: BellNote[] = [[523.25, 0], [659.25, 0.3], [783.99, 0.6], [1046.5, 0.95]];
export const RING_REPEAT_AT = 2.1;
/** Somebody waved: a friendly rising pair (G then high C), like a doorbell greeting. */
export const WAVE_FIGURE: BellNote[] = [[783.99, 0], [1046.5, 0.32]];

/** One warm bell: a hum an octave down, the note, and two overtones, each a touch detuned for a soft shimmer. */
function bellNote(ctx: AudioContext, out: AudioNode, freq: number, at: number, loud: number, ring: number): void {
  const t = ctx.currentTime + at;
  const parts: [number, number, number][] = [[0.5, 0.32, 1.1], [1, 1, 1], [2, 0.42, 0.8], [3.01, 0.16, 0.55], [4.2, 0.07, 0.35]];
  for (const [mult, amp, life] of parts) {
    for (const cents of [-4, 4]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq * mult;
      o.detune.value = cents;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp * 0.5 * loud), t + 0.018);
      g.gain.exponentialRampToValueAtTime(0.0001, t + ring * life);
      o.connect(g);
      g.connect(out);
      o.start(t);
      o.stop(t + ring * life + 0.05);
    }
  }
}

/** Play a bell figure (optionally repeated) through a gentle echo and a compressor. */
function bells(figure: BellNote[], opts: { volume: number; ring: number; repeatAt?: number; repeatLoud?: number }): void {
  try {
    const ctx = new AudioContext();
    // the compressor evens out the peaks so the whole phrase can be turned up a lot (loud) without harshness or clipping
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -22;
    comp.knee.value = 18;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.35;
    const master = ctx.createGain();
    master.gain.value = Math.min(1, opts.volume * 1.9);
    master.connect(comp);
    // a last stage that never lets the sum of the bells and their echo go past full scale (that would crackle)
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.12;
    limiter.connect(ctx.destination);
    comp.connect(limiter);
    // a slow, soft echo so the bells bloom
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.36;
    const fb = ctx.createGain();
    fb.gain.value = 0.3;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 3200;
    comp.connect(delay);
    delay.connect(tone);
    tone.connect(fb);
    fb.connect(delay);
    tone.connect(limiter);
    for (const [freq, at] of figure) bellNote(ctx, master, freq, at, 1, opts.ring);
    let end = figure[figure.length - 1][1] + opts.ring;
    if (opts.repeatAt !== undefined) {
      for (const [freq, at] of figure) bellNote(ctx, master, freq, at + opts.repeatAt, opts.repeatLoud ?? 0.8, opts.ring);
      end += opts.repeatAt;
    }
    window.setTimeout(() => void ctx.close(), (end + 2) * 1000);
  } catch {
    /* no sound is fine */
  }
}

/** Someone is ringing you: a warm rising bell figure, twice. Calm, but loud enough to notice from across the room. */
export function playRing(volume = 0.5): void {
  bells(RING_FIGURE, { volume, ring: 2.6, repeatAt: RING_REPEAT_AT, repeatLoud: 0.85 });
}

/** Someone waved: two friendly bells, a gentle hello you can still hear. */
export function playWave(volume = 0.62): void {
  bells(WAVE_FIGURE, { volume, ring: 2 });
}

/** A recording started (rising pair) or stopped (falling pair), so everyone in the room knows. */
export function playRecordingCue(started: boolean, volume = 0.3): void {
  phrase(started ? [[440, 0], [659.25, 0.22], [880, 0.44]] : [[880, 0], [659.25, 0.22], [440, 0.44]], volume, 1.1);
}
