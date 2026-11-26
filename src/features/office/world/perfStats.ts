// Live numbers about how the Office is running on THIS computer, and the "Smooth mode" switch for slower computers.
// Plain module-level numbers (no React), so the drawing loop and the network code can update them without any cost.
//  - Press Ctrl + Alt + P in the Office to show them on screen (it helps find out what is slow).
//  - Smooth mode: draws 30 pictures a second instead of 60, at normal sharpness, and without rain and the other weather effects.
//    It is also switched on by itself if the Office stays slow after it has already lowered its sharpness as far as it goes.

const KEY = 'kd:office:smooth';
function readSmooth(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export const perf = {
  fps: 0,
  /** time between two drawn pictures, ms */
  frameMs: 0,
  /** time the drawing itself took on the main thread, ms (average) */
  workMs: 0,
  /** people drawn now / people online */
  drawn: 0,
  online: 0,
  dpr: 1,
  /** 0 = sharpest; the Office steps this up by itself when frames are slow */
  quality: 0,
  smooth: readSmooth(),
  /** switched on by itself because the Office stayed slow */
  autoSmooth: false,
  /** movement messages received and sent, per second */
  msgIn: 0,
  msgOut: 0,
  /** voice connections open */
  rtc: 0,
};

export function setSmooth(on: boolean) {
  perf.smooth = on;
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* fine */ }
}

/** Smooth mode is on, by choice or by itself. */
export const smoothNow = () => perf.smooth || perf.autoSmooth;

let inCount = 0;
let outCount = 0;
let sinceAt = 0;
export const countIn = () => { inCount += 1; };
export const countOut = () => { outCount += 1; };
/** Turn the counts into per-second numbers (called about twice a second by the on-screen readout). */
export function rollMessageRates(now: number) {
  if (!sinceAt) { sinceAt = now; return; }
  const s = (now - sinceAt) / 1000;
  if (s < 0.4) return;
  perf.msgIn = Math.round(inCount / s);
  perf.msgOut = Math.round(outCount / s);
  inCount = 0; outCount = 0; sinceAt = now;
}

export function perfReadout(): string {
  return [
    `Pictures/s ${perf.fps}   gap ${perf.frameMs.toFixed(1)} ms   drawing ${perf.workMs.toFixed(1)} ms`,
    `People drawn ${perf.drawn} of ${perf.online} online   sharpness ${perf.dpr.toFixed(2)} (step ${perf.quality})`,
    `Movement messages in ${perf.msgIn}/s out ${perf.msgOut}/s   voice links ${perf.rtc}`,
    `Smooth mode ${perf.smooth ? 'on' : perf.autoSmooth ? 'on (by itself)' : 'off'}`,
  ].join('\n');
}
