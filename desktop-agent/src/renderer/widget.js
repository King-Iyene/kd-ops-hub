// Tiny, dependency-free renderer for the floating tracking-status widget.
// Mirrors renderer.js's plain-script style — no bundler in this project.

const dot = document.getElementById('dot');
const label = document.getElementById('label');
const elapsedEl = document.getElementById('elapsed');
const openBtn = document.getElementById('open-btn');

let trackingStartedAt = null; // ms epoch, set once per tracking session
let tickHandle = null;

function formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function renderTick() {
  if (trackingStartedAt == null) {
    elapsedEl.textContent = '00:00:00';
    return;
  }
  elapsedEl.textContent = formatElapsed(Date.now() - trackingStartedAt);
}

function setState(state) {
  // state: 'tracking' | 'idle' | 'disabled'
  dot.className = state === 'tracking' ? 'tracking' : state === 'idle' ? 'idle' : '';
  if (state === 'tracking') {
    label.textContent = 'Tracking';
  } else if (state === 'idle') {
    label.textContent = 'Idle — paused';
  } else {
    label.textContent = 'Not tracking';
  }
}

window.widget.onStatus(({ tracking, idle, startedAt }) => {
  if (startedAt != null) trackingStartedAt = startedAt;
  if (!tracking) {
    trackingStartedAt = null;
    setState('disabled');
  } else if (idle) {
    setState('idle');
  } else {
    setState('tracking');
  }
  renderTick();
});

openBtn.addEventListener('click', () => window.widget.openMain());

tickHandle = setInterval(renderTick, 1000);
window.addEventListener('beforeunload', () => clearInterval(tickHandle));
