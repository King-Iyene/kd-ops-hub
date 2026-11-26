// What a recording shows. Without a screen share it is the office map. While somebody shares a screen, the recording
// is a presentation: everyone's picture in a strip at the top (the map first, so you can see where people stand) and the
// shared screen large beneath, just as the people in the meeting saw it.

export interface Rect { x: number; y: number; w: number; h: number }

export interface FrameLayout {
  /** the strip of small pictures at the top (empty when nothing is being shared) */
  strip: Rect[];
  /** where each shared screen goes (one, or the first two side by side); a single full-frame cell for the map when nothing is shared */
  stage: Rect[];
}

const GAP = 8;

/** Where everything goes in a frame of this size. `pictures` counts the cameras on top of the map. */
export function layoutFrame(w: number, h: number, screens: number, pictures: number): FrameLayout {
  if (screens <= 0) return { strip: [], stage: [{ x: 0, y: 0, w, h }] };
  const stripH = Math.round(h * 0.15);
  const cellW = Math.round((stripH * 4) / 3);
  const fit = Math.max(1, Math.floor((w + GAP) / (cellW + GAP)));
  const count = Math.min(pictures + 1, fit); // the map, then cameras, as many as fit
  const strip: Rect[] = [];
  for (let i = 0; i < count; i++) strip.push({ x: i * (cellW + GAP), y: 0, w: cellW, h: stripH });
  const top = stripH + GAP;
  const stageH = h - top;
  const shown = Math.min(screens, 2);
  const stage: Rect[] = [];
  const each = Math.floor((w - GAP * (shown - 1)) / shown);
  for (let i = 0; i < shown; i++) stage.push({ x: i * (each + GAP), y: top, w: each, h: stageH });
  return { strip, stage };
}

/** The biggest rectangle of the source's shape that fits inside the box, centred (nothing is cropped or stretched). */
export function fitInside(srcW: number, srcH: number, box: Rect): Rect {
  if (srcW <= 0 || srcH <= 0) return box;
  const k = Math.min(box.w / srcW, box.h / srcH);
  const w = Math.round(srcW * k);
  const h = Math.round(srcH * k);
  return { x: box.x + Math.round((box.w - w) / 2), y: box.y + Math.round((box.h - h) / 2), w, h };
}

/** The same, but filling the box and cropping the overflow (for camera pictures). Returns the part of the source to draw. */
export function coverCrop(srcW: number, srcH: number, box: Rect): { sx: number; sy: number; sw: number; sh: number } {
  if (srcW <= 0 || srcH <= 0) return { sx: 0, sy: 0, sw: srcW, sh: srcH };
  const k = Math.max(box.w / srcW, box.h / srcH);
  const sw = box.w / k;
  const sh = box.h / k;
  return { sx: (srcW - sw) / 2, sy: (srcH - sh) / 2, sw, sh };
}

export interface CameraPicture { name: string; video: HTMLVideoElement }
export interface ScreenPicture { name: string; stream: MediaStream }

export interface Compositor { track: MediaStreamTrack | null; stop: () => void }

/** A timer that keeps its pace in a hidden tab: a page's own timers are slowed down there, a worker's are not. */
function steadyTimer(ms: number, tick: () => void): () => void {
  try {
    const src = `setInterval(function(){postMessage(0)}, ${Math.max(10, Math.round(ms))});`;
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const w = new Worker(url);
    w.onmessage = tick;
    return () => { w.terminate(); URL.revokeObjectURL(url); };
  } catch {
    const id = setInterval(tick, ms);
    return () => clearInterval(id);
  }
}

/**
 * Draws the recording's picture onto a canvas and hands back its video track.
 * The recording only has to ask: where is the map, which screens are being shared, whose cameras are on.
 */
export function createCompositor(src: {
  getMap: () => HTMLCanvasElement | null;
  getScreens: () => ScreenPicture[];
  getCameras: () => CameraPicture[];
  width?: number;
  height?: number;
  fps?: number;
}): Compositor {
  const W = src.width ?? 1280;
  const H = src.height ?? 720;
  const fps = src.fps ?? 15;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx || typeof canvas.captureStream !== 'function') return { track: null, stop: () => undefined };

  // one hidden, playing video for each shared screen
  const screenVideos = new Map<string, HTMLVideoElement>();
  const videoFor = (s: ScreenPicture): HTMLVideoElement => {
    let v = screenVideos.get(s.stream.id);
    if (!v) {
      v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.srcObject = s.stream;
      void v.play().catch(() => undefined);
      screenVideos.set(s.stream.id, v);
    }
    return v;
  };

  const label = (text: string, r: Rect) => {
    ctx.font = '600 15px system-ui, sans-serif';
    const w = Math.min(r.w - 12, ctx.measureText(text).width + 16);
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.fillRect(r.x + 6, r.y + 6, w, 24);
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, r.x + 14, r.y + 18, w - 16);
  };

  const draw = () => {
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, W, H);
    const map = src.getMap();
    const screens = src.getScreens().filter((s) => s.stream.getVideoTracks().some((t) => t.readyState === 'live'));
    const cams = src.getCameras().filter((c) => c.video.readyState >= 2 && c.video.videoWidth > 0);
    const lay = layoutFrame(W, H, screens.length, cams.length);
    const drawMap = (box: Rect) => {
      if (!map || map.width <= 0 || map.height <= 0) return;
      const r = fitInside(map.width, map.height, box);
      try { ctx.drawImage(map, r.x, r.y, r.w, r.h); } catch { /* a frame that is not ready is skipped */ }
    };
    if (!screens.length) { drawMap(lay.stage[0]); return; }
    // everyone's picture at the top: the map first, then the cameras
    drawMap(lay.strip[0]);
    cams.slice(0, Math.max(0, lay.strip.length - 1)).forEach((c, i) => {
      const box = lay.strip[i + 1];
      const k = coverCrop(c.video.videoWidth, c.video.videoHeight, box);
      try { ctx.drawImage(c.video, k.sx, k.sy, k.sw, k.sh, box.x, box.y, box.w, box.h); } catch { /* skipped */ }
      label(c.name, box);
    });
    // the shared screen(s) large beneath
    screens.slice(0, lay.stage.length).forEach((s, i) => {
      const v = videoFor(s);
      const box = lay.stage[i];
      if (v.videoWidth > 0) {
        const r = fitInside(v.videoWidth, v.videoHeight, box);
        try { ctx.drawImage(v, r.x, r.y, r.w, r.h); } catch { /* skipped */ }
      }
      label(s.name, box);
    });
    // forget pictures of screens that are no longer shared
    for (const [id, v] of screenVideos) if (!screens.some((s) => s.stream.id === id)) { v.srcObject = null; screenVideos.delete(id); }
  };

  draw();
  const stream = canvas.captureStream(fps);
  const stopTimer = steadyTimer(1000 / fps, draw);
  return {
    track: stream.getVideoTracks()[0] ?? null,
    stop: () => { stopTimer(); for (const v of screenVideos.values()) v.srcObject = null; screenVideos.clear(); stream.getTracks().forEach((t) => t.stop()); },
  };
}
