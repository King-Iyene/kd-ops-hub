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

/** The graphics the browser is using, e.g. "NVIDIA GeForce ..." or "Google SwiftShader" (a slow software stand-in for a graphics card). */
let gpuName: string | null = null;
export function graphicsName(): string {
  if (gpuName !== null) return gpuName;
  gpuName = 'unknown';
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl') || c.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : '';
      gpuName = (name || String(gl.getParameter(gl.RENDERER) || '')).replace(/^ANGLE \((.*)\)$/, '$1').slice(0, 70) || 'unknown';
    } else gpuName = 'no graphics acceleration';
  } catch { /* keep unknown */ }
  return gpuName;
}
export const isSoftwareGraphics = (name: string) => /swiftshader|llvmpipe|software|basic render|no graphics acceleration|softpipe/i.test(name);

type Tone = 'good' | 'warn' | 'bad' | 'plain';
const TONE_COLOR: Record<Tone, string> = { good: '#5eead4', warn: '#fbbf24', bad: '#fb7185', plain: '#e6f6fb' };
/** What the numbers add up to, in a sentence. */
export function perfVerdict(): { text: string; tone: Tone } {
  if (isSoftwareGraphics(graphicsName())) return { text: 'Graphics acceleration is not being used, so the drawing runs on the processor. That is the likely reason it is slow.', tone: 'bad' };
  if (perf.fps >= 45) return { text: 'Running smoothly.', tone: 'good' };
  if (perf.workMs > 20 && perf.fps < 30) return { text: 'Drawing is the slow part, not the network, and the graphics chip is working. The processor is likely busy with other programs: check Task Manager, or try Smooth mode.', tone: 'bad' };
  if (perf.msgIn > 150) return { text: 'Many movement messages are arriving: the network is busy.', tone: 'warn' };
  if (perf.rtc > 8) return { text: 'Many voice links are open. That is heavy on the processor.', tone: 'warn' };
  if (perf.fps >= 50) return { text: 'Running smoothly.', tone: 'good' };
  return { text: 'Fine for now.', tone: 'plain' };
}

/** The readout panel: one line per number, coloured by how healthy it is. Built outside React; call update() twice a second. */
export function createHud(): { el: HTMLElement; update: () => void } {
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  el.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:99999;width:270px;padding:10px 12px 11px;border-radius:14px;pointer-events:none;'
    + 'font:12px/1.35 "Manrope",ui-sans-serif,system-ui,sans-serif;color:#e6f6fb;background:linear-gradient(165deg,rgba(6,56,78,.94),rgba(3,26,38,.94));'
    + 'border:1px solid rgba(0,236,255,.22);box-shadow:0 18px 40px -14px rgba(0,0,0,.7)';
  const title = document.createElement('div');
  title.textContent = 'OFFICE PERFORMANCE';
  title.style.cssText = 'font-size:10px;font-weight:800;letter-spacing:.14em;color:#D6AC50;margin-bottom:6px';
  el.appendChild(title);
  const rows = new Map<string, HTMLElement>();
  const row = (key: string, label: string) => {
    const r = document.createElement('div');
    r.style.cssText = 'display:flex;justify-content:space-between;gap:10px;padding:2px 0;border-top:1px solid rgba(255,255,255,.06)';
    const l = document.createElement('span'); l.textContent = label; l.style.color = '#8fb3c4';
    const v = document.createElement('span'); v.style.cssText = 'font-weight:700;text-align:right;font-variant-numeric:tabular-nums;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    r.append(l, v); el.appendChild(r); rows.set(key, v);
  };
  for (const [k, l] of [['fps', 'Pictures per second'], ['work', 'Time to draw one'], ['gap', 'Gap between pictures'], ['people', 'People drawn'], ['sharp', 'Sharpness'], ['net', 'Movement messages'], ['voice', 'Voice links'], ['smooth', 'Smooth mode'], ['gpu', 'Graphics']] as const) row(k, l);
  const verdict = document.createElement('div');
  verdict.style.cssText = 'margin-top:7px;padding:6px 8px;border-radius:8px;font-weight:700;font-size:11.5px';
  el.appendChild(verdict);
  const set = (k: string, text: string, tone: Tone) => { const v = rows.get(k); if (v) { v.textContent = text; v.style.color = TONE_COLOR[tone]; if (k === 'gpu') v.title = text; } };
  const update = () => {
    rollMessageRates(performance.now());
    set('fps', String(perf.fps), perf.fps >= 50 ? 'good' : perf.fps >= 25 ? 'warn' : 'bad');
    set('work', `${perf.workMs.toFixed(1)} ms`, perf.workMs < 8 ? 'good' : perf.workMs < 16 ? 'warn' : 'bad');
    set('gap', `${perf.frameMs.toFixed(1)} ms`, perf.frameMs < 20 ? 'good' : perf.frameMs < 40 ? 'warn' : 'bad');
    set('people', `${perf.drawn} of ${perf.online} online`, 'plain');
    set('sharp', `${perf.dpr.toFixed(2)} (step ${perf.quality + 1} of 3)`, perf.quality === 0 ? 'good' : 'warn');
    set('net', `${perf.msgIn} in, ${perf.msgOut} out per second`, perf.msgIn > 150 ? 'bad' : perf.msgIn > 60 ? 'warn' : 'good');
    set('voice', String(perf.rtc), perf.rtc > 8 ? 'warn' : 'good');
    set('smooth', perf.smooth ? 'On' : perf.autoSmooth ? 'On, by itself' : 'Off', 'plain');
    const g = graphicsName();
    set('gpu', g, isSoftwareGraphics(g) ? 'bad' : 'good');
    const v = perfVerdict();
    verdict.textContent = v.text;
    verdict.style.color = TONE_COLOR[v.tone];
    verdict.style.background = v.tone === 'bad' ? 'rgba(251,113,133,.12)' : v.tone === 'warn' ? 'rgba(251,191,36,.12)' : 'rgba(94,234,212,.1)';
  };
  update();
  return { el, update };
}
