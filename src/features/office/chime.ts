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
