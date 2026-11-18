// Project-only picker: search (by project or client name), a "Suggested"
// section of the employee's own recently-tracked projects, and a
// collapsible "All Projects" tree grouped Client > Project. No task level
// is shown or selectable anywhere — every project tracks on its own
// implicit "General" task behind the scenes. Deliberately plain DOM/vanilla
// JS, matching the rest of this app's renderer scripts (no build step for
// these windows).

const searchInput = document.getElementById('search');
const listEl = document.getElementById('list');
const noTaskEl = document.getElementById('no-task');

let suggested = [];
let allProjects = [];
let dataLoaded = false; // true once the main process has sent any project data
let query = '';
// Collapsed state is keyed by a group key ("client::<name>") — absent from
// the set means expanded. Starts empty so everything is expanded by default
// on first open (there's no large dataset yet to make that unwieldy, and
// it's more discoverable than starting collapsed).
const collapsed = new Set();
let activeIndex = -1; // index into the current flat `selectable` rows

function groupKey(prefix, name) {
  return `${prefix}::${name ?? ''}`;
}

// { clientName: string|null, projects: PickableProject[] }[]
function buildTree(projects) {
  const clients = new Map(); // clientName -> PickableProject[]
  for (const p of projects) {
    const clientKey = p.clientName ?? '';
    if (!clients.has(clientKey)) clients.set(clientKey, []);
    clients.get(clientKey).push(p);
  }
  return [...clients.entries()]
    .sort((a, b) => (a[0] || '￿').localeCompare(b[0] || '￿'))
    .map(([clientName, projects]) => ({
      clientName: clientName || null,
      projects: [...projects].sort((a, b) => a.projectName.localeCompare(b.projectName)),
    }));
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function projectRowHtml(p, idx) {
  return `<div class="row" data-idx="${idx}">
    <div>${escapeHtml(p.projectName)}</div>
    ${p.clientName ? `<div class="path">${escapeHtml(p.clientName)}</div>` : ''}
  </div>`;
}

function render() {
  // `selectable` mirrors what's actually rendered as clickable project rows,
  // in order, so arrow-key navigation and Enter-to-choose stay in sync with
  // whatever's currently shown (search results vs. the tree).
  const selectable = [];
  let html = '';

  if (query.trim()) {
    const q = query.trim().toLowerCase();
    const matches = allProjects.filter((p) => [p.clientName, p.projectName].filter(Boolean).join(' · ').toLowerCase().includes(q));
    if (matches.length === 0) {
      html = '<div id="empty">No matching project</div>';
    } else {
      html += '<div class="section-header">Results</div>';
      for (const p of matches) {
        selectable.push(p);
        html += projectRowHtml(p, selectable.length - 1);
      }
    }
  } else {
    if (suggested.length) {
      html += '<div class="section-header">Suggested</div>';
      for (const p of suggested) {
        selectable.push(p);
        html += projectRowHtml(p, selectable.length - 1);
      }
    }
    html += '<div class="section-header">All Projects</div>';
    const tree = buildTree(allProjects);
    if (tree.length === 0) {
      html += dataLoaded
        ? '<div id="empty">No projects yet — create one in the web app (Time Tracking → Projects)</div>'
        : '<div id="empty">Loading…</div>';
    }
    for (const client of tree) {
      const clientKey = groupKey('client', client.clientName);
      const clientCollapsed = collapsed.has(clientKey);
      html += `<div class="group-row${clientCollapsed ? ' collapsed' : ''}" data-toggle="${clientKey}">
        <span class="chevron">▾</span>${escapeHtml(client.clientName ?? '(No Client)')}
      </div>`;
      if (clientCollapsed) continue;
      for (const p of client.projects) {
        selectable.push(p);
        html += projectRowHtml(p, selectable.length - 1);
      }
    }
  }

  listEl.innerHTML = html;
  render.selectable = selectable;
  if (activeIndex >= selectable.length) activeIndex = selectable.length - 1;
  applyActiveClass();

  listEl.querySelectorAll('.group-row[data-toggle]').forEach((el) => {
    el.addEventListener('click', () => {
      const key = el.getAttribute('data-toggle');
      if (collapsed.has(key)) collapsed.delete(key);
      else collapsed.add(key);
      render();
    });
  });
  listEl.querySelectorAll('.row[data-idx]').forEach((el) => {
    el.addEventListener('click', () => {
      const idx = Number(el.getAttribute('data-idx'));
      chooseIndex(idx);
    });
  });
}

function applyActiveClass() {
  listEl.querySelectorAll('.row[data-idx]').forEach((el) => {
    el.classList.toggle('active', Number(el.getAttribute('data-idx')) === activeIndex);
  });
}

function chooseIndex(idx) {
  const project = render.selectable?.[idx];
  if (project) window.taskPicker.chooseProject(project);
}

searchInput.addEventListener('input', () => {
  query = searchInput.value;
  activeIndex = -1;
  render();
});

noTaskEl.addEventListener('click', () => window.taskPicker.chooseNoTask());

document.addEventListener('keydown', (e) => {
  const selectable = render.selectable ?? [];
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeIndex = Math.min(activeIndex + 1, selectable.length - 1);
    applyActiveClass();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeIndex = Math.max(activeIndex - 1, 0);
    applyActiveClass();
  } else if (e.key === 'Enter') {
    if (activeIndex >= 0) chooseIndex(activeIndex);
  } else if (e.key === 'Escape') {
    window.taskPicker.cancel();
  }
});

window.taskPicker.onData(({ suggested: s, projects }) => {
  suggested = s;
  allProjects = projects ?? [];
  dataLoaded = true;
  render();
});

window.taskPicker.requestTasks();
render();
