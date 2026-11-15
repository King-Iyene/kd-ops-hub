// Tiny, dependency-free renderer for the floating tracking-status widget.
// Mirrors renderer.js's plain-script style — no bundler in this project.

const dot = document.getElementById('dot');
const label = document.getElementById('label');
const elapsedEl = document.getElementById('elapsed');
const openBtn = document.getElementById('open-btn');
const stopBtn = document.getElementById('stop-btn');
const pauseBtn = document.getElementById('pause-btn');

let trackingStartedAt = null; // ms epoch, set once per tracking session
let currentTask = null; // { name, project, startedAt } | null — the manual task timer, if one is running
let pausedTask = null; // { name, project } | null — set only when currentTask is null, see render()
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
  const anchor = currentTask ? currentTask.startedAt : trackingStartedAt;
  if (anchor == null) {
    elapsedEl.textContent = '00:00:00';
    return;
  }
  elapsedEl.textContent = formatElapsed(Date.now() - anchor);
}

function setState(state) {
  // state: 'tracking' | 'idle' | 'disabled' — ignored while a task is active,
  // since the task name takes over the label in that case (see render() below).
  dot.className = state === 'tracking' ? 'tracking' : state === 'idle' ? 'idle' : '';
  if (state === 'tracking') {
    // "No Task" (not "Tracking") when automatic tracking is on but nobody
    // has picked a manual task — clickable, same as the task name is once
    // one's running, so starting a task doesn't require finding the tray.
    label.textContent = 'No Task';
  } else if (state === 'idle') {
    label.textContent = 'Idle — paused';
  } else {
    label.textContent = 'Not tracking';
  }
}

function render() {
  if (currentTask) {
    dot.className = 'tracking';
    label.textContent = currentTask.name;
    stopBtn.classList.add('visible');
    pauseBtn.classList.add('visible');
    pauseBtn.textContent = '❙❙';
    pauseBtn.title = 'Pause this task';
  } else if (pausedTask) {
    // Distinct from the "tracking"/"idle"/"disabled" states in setState() —
    // those describe the automatic window/activity tracker, this describes
    // the separate manual task timer, so both can be true at once (e.g.
    // automatic tracking still on, manual task paused).
    dot.className = 'paused';
    label.textContent = `${pausedTask.name} (paused)`;
    stopBtn.classList.remove('visible');
    pauseBtn.classList.add('visible');
    pauseBtn.textContent = '▶';
    pauseBtn.title = 'Resume this task';
  } else {
    stopBtn.classList.remove('visible');
    pauseBtn.classList.remove('visible');
  }
  renderTick();
}

window.widget.onStatus(({ tracking, idle, startedAt, task, pausedTask: pt }) => {
  if (startedAt != null) trackingStartedAt = startedAt;
  if (!tracking) {
    trackingStartedAt = null;
    setState('disabled');
  } else if (idle) {
    setState('idle');
  } else {
    setState('tracking');
  }
  currentTask = task ?? null;
  pausedTask = pt ?? null;
  render();
});

openBtn.addEventListener('click', () => window.widget.openMain());
stopBtn.addEventListener('click', () => window.widget.stopTask());
pauseBtn.addEventListener('click', () => {
  if (currentTask) window.widget.pauseTask();
  else if (pausedTask) window.widget.resumeTask();
});
label.addEventListener('click', () => window.widget.changeTask());

tickHandle = setInterval(renderTick, 1000);
window.addEventListener('beforeunload', () => clearInterval(tickHandle));
