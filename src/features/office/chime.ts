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

/** Someone is ringing you: four slow falling notes in a minor key (A minor), clearly audible and unhurried. */
export function playRing(volume = 0.42): void {
  phrase([[659.25, 0], [523.25, 0.55], [440, 1.1], [329.63, 1.75]], volume, 2.6);
}

/** Someone waved: a short, tender three-note fall (D minor). */
export function playWave(volume = 0.36): void {
  phrase([[587.33, 0], [440, 0.4], [349.23, 0.8]], volume, 1.8);
}

/** A recording started (rising pair) or stopped (falling pair), so everyone in the room knows. */
export function playRecordingCue(started: boolean, volume = 0.3): void {
  phrase(started ? [[440, 0], [659.25, 0.22], [880, 0.44]] : [[880, 0], [659.25, 0.22], [440, 0.44]], volume, 1.1);
}
