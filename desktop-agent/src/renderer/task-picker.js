const searchEl = document.getElementById('search');
const listEl = document.getElementById('list');
const noTaskEl = document.getElementById('no-task');

let tasks = [];
let selectedIndex = -1;

function render(filtered) {
  listEl.innerHTML = '';
  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.id = 'empty';
    empty.textContent = 'No matching tasks. Create tasks under Time Tracking → Projects first.';
    listEl.appendChild(empty);
    return;
  }
  filtered.forEach((t, i) => {
    const row = document.createElement('div');
    row.className = 'row' + (i === selectedIndex ? ' active' : '');
    row.innerHTML = `<div class="task">${escapeHtml(t.taskName)}</div><div class="path">${escapeHtml([t.clientName, t.projectName].filter(Boolean).join(' · '))}</div>`;
    row.addEventListener('click', () => choose(t));
    listEl.appendChild(row);
  });
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function filteredTasks() {
  const q = searchEl.value.trim().toLowerCase();
  if (!q) return tasks;
  return tasks.filter((t) => t.searchLabel.toLowerCase().includes(q));
}

function choose(task) {
  window.taskPicker.chooseTask(task);
}

noTaskEl.addEventListener('click', () => {
  window.taskPicker.chooseNoTask();
});

searchEl.addEventListener('input', () => {
  selectedIndex = -1;
  render(filteredTasks());
});

searchEl.addEventListener('keydown', (e) => {
  const filtered = filteredTasks();
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedIndex = Math.min(selectedIndex + 1, filtered.length - 1);
    render(filtered);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedIndex = Math.max(selectedIndex - 1, 0);
    render(filtered);
  } else if (e.key === 'Enter') {
    if (selectedIndex >= 0 && filtered[selectedIndex]) choose(filtered[selectedIndex]);
  } else if (e.key === 'Escape') {
    window.taskPicker.cancel();
  }
});

window.taskPicker.onTasks((list) => {
  tasks = list;
  render(filteredTasks());
});

window.taskPicker.requestTasks();
