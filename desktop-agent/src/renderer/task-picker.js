// Full task-picker rebuild: search (flattens everything when active), a
// "Suggested" section of the employee's own recently-used tasks, and a
// collapsible "All Projects and Tasks" tree grouped Client > Project > Task
// — plus inline "Create task…". Deliberately plain DOM/vanilla JS, matching
// the rest of this app's renderer scripts (no build step for these windows).

const searchInput = document.getElementById('search');
const listEl = document.getElementById('list');
const noTaskEl = document.getElementById('no-task');
const createLinkEl = document.getElementById('create-link');
const createFormEl = document.getElementById('create-form');
const createNameEl = document.getElementById('create-name');
const createProjectEl = document.getElementById('create-project');
const createSelectAfterEl = document.getElementById('create-select-after');
const createErrorEl = document.getElementById('create-error');
const createCancelBtn = document.getElementById('create-cancel');
const createSubmitBtn = document.getElementById('create-submit');

let allTasks = [];
let suggested = [];
let allProjects = [];
let dataLoaded = false; // true once the main process has sent any project/task data
let query = '';
// Collapsed state is keyed by a group key ("client::<name>" / "project::<id>")
// — absent from the set means expanded. Starts empty so everything is
// expanded by default on first open (there's no large dataset yet to make
// that unwieldy, and it's more discoverable than starting collapsed).
const collapsed = new Set();
let mode = 'browse'; // 'browse' | 'create'
let activeIndex = -1; // index into the current flat `selectable` rows

function groupKey(prefix, name) {
  return `${prefix}::${name ?? ''}`;
}

// { clientName: string|null, projects: { projectId, projectName, tasks: PickableTask[] }[] }[]
function buildTree(tasks, projects = []) {
  const clients = new Map(); // clientName -> Map(projectId -> { projectName, tasks[] })
  // Seed from the project list first so a project with zero tasks still gets
  // a row (TimeCamp shows empty projects; deriving the tree from tasks alone
  // made a freshly created project invisible).
  for (const p of projects) {
    const clientKey = p.clientName ?? '';
    if (!clients.has(clientKey)) clients.set(clientKey, new Map());
    const byProject = clients.get(clientKey);
    if (!byProject.has(p.projectId)) byProject.set(p.projectId, { projectName: p.projectName, tasks: [] });
  }
  for (const t of tasks) {
    const clientKey = t.clientName ?? '';
    if (!clients.has(clientKey)) clients.set(clientKey, new Map());
    const projects = clients.get(clientKey);
    if (!projects.has(t.projectId)) projects.set(t.projectId, { projectName: t.projectName, tasks: [] });
    projects.get(t.projectId).tasks.push(t);
  }
  return [...clients.entries()]
    .sort((a, b) => (a[0] || '￿').localeCompare(b[0] || '￿'))
    .map(([clientName, projects]) => ({
      clientName: clientName || null,
      projects: [...projects.entries()]
        .sort((a, b) => a[1].projectName.localeCompare(b[1].projectName))
        .map(([projectId, p]) => ({ projectId, projectName: p.projectName, tasks: p.tasks })),
    }));
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function taskRowHtml(task, idx) {
  return `<div class="row task-row" data-idx="${idx}">
    <div class="task">${escapeHtml(task.taskName)}</div>
    <div class="path">${escapeHtml([task.clientName, task.projectName].filter(Boolean).join(' · '))}</div>
  </div>`;
}

// "Track project": starts the project's own General task, for work that belongs to the project but to no specific task.
function trackProjectHtml(p) {
  return `<span class="track-project" data-track-project="${escapeHtml(p.projectId)}" data-project-name="${escapeHtml(p.projectName)}" data-client="${escapeHtml(p.clientName || '')}" title="Track time on the project itself">▶ Track project</span>`;
}

// People only track projects and the tasks an admin made: nobody adds tasks from the tracker any more (admins do that in the web app).
function addTaskRowHtml() {
  return '';
}

function render() {
  // `selectable` mirrors what's actually rendered as clickable task rows, in
  // order, so arrow-key navigation and Enter-to-choose stay in sync with
  // whatever's currently shown (search results vs. the tree).
  const selectable = [];
  let html = '';

  if (query.trim()) {
    const q = query.trim().toLowerCase();
    const matches = allTasks.filter((t) => t.searchLabel.toLowerCase().includes(q));
    const withTasks = new Set(allTasks.map((t) => t.projectId));
    const emptyProjectMatches = allProjects.filter(
      (p) => !withTasks.has(p.projectId) && [p.clientName, p.projectName].filter(Boolean).join(' · ').toLowerCase().includes(q),
    );
    if (matches.length === 0 && emptyProjectMatches.length === 0) {
      html = '<div id="empty">No matching tasks</div>';
    } else {
      html += '<div class="section-header">Results</div>';
      for (const t of matches) {
        selectable.push(t);
        html += taskRowHtml(t, selectable.length - 1);
      }
      for (const p of emptyProjectMatches) {
        html += `<div class="group-row project-row">${escapeHtml(p.projectName)}${trackProjectHtml(p)}</div>${addTaskRowHtml(p.projectId)}`;
      }
    }
  } else {
    if (suggested.length) {
      html += '<div class="section-header">Suggested</div>';
      for (const t of suggested) {
        selectable.push(t);
        html += taskRowHtml(t, selectable.length - 1);
      }
    }
    html += '<div class="section-header">All Projects and Tasks</div>';
    const tree = buildTree(allTasks, allProjects);
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
      for (const project of client.projects) {
        const projectKey = groupKey('project', project.projectId);
        const projectCollapsed = collapsed.has(projectKey);
        html += `<div class="group-row project-row${projectCollapsed ? ' collapsed' : ''}" data-toggle="${projectKey}">
          <span class="chevron">▾</span>${escapeHtml(project.projectName)}${trackProjectHtml({ projectId: project.projectId, projectName: project.projectName, clientName: client.clientName })}
        </div>`;
        if (projectCollapsed) continue;
        for (const t of project.tasks) {
          selectable.push(t);
          html += taskRowHtml(t, selectable.length - 1);
        }
        html += addTaskRowHtml(project.projectId);
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
  listEl.querySelectorAll('.track-project[data-track-project]').forEach((el) => {
    el.addEventListener('click', (ev) => {
      ev.stopPropagation(); // do not also collapse/expand the project
      window.taskPicker.chooseProject({
        projectId: el.getAttribute('data-track-project'),
        projectName: el.getAttribute('data-project-name'),
        clientName: el.getAttribute('data-client') || null,
      });
    });
  });
  listEl.querySelectorAll('.add-task-row[data-add-project]').forEach((el) => {
    el.addEventListener('click', () => enterCreateMode(el.getAttribute('data-add-project')));
  });
  listEl.querySelectorAll('.row.task-row[data-idx]').forEach((el) => {
    el.addEventListener('click', () => {
      const idx = Number(el.getAttribute('data-idx'));
      chooseIndex(idx);
    });
  });
}

function applyActiveClass() {
  listEl.querySelectorAll('.row.task-row[data-idx]').forEach((el) => {
    el.classList.toggle('active', Number(el.getAttribute('data-idx')) === activeIndex);
  });
}

function chooseIndex(idx) {
  const task = render.selectable?.[idx];
  if (task) window.taskPicker.chooseTask(task);
}

searchInput.addEventListener('input', () => {
  query = searchInput.value;
  activeIndex = -1;
  render();
});

noTaskEl.addEventListener('click', () => window.taskPicker.chooseNoTask());

document.addEventListener('keydown', (e) => {
  if (mode !== 'browse') {
    if (e.key === 'Escape') window.taskPicker.cancel();
    return;
  }
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

// --- Inline "Create task…" -------------------------------------------------

function sortedProjects(projects) {
  // Fed from a direct time_projects fetch (allProjects), not derived from
  // allTasks — a brand-new project with zero tasks under it still needs to
  // be selectable here, or its first task could never be created.
  return [...projects].sort((a, b) => {
    const an = [a.clientName, a.projectName].filter(Boolean).join(' · ');
    const bn = [b.clientName, b.projectName].filter(Boolean).join(' · ');
    return an.localeCompare(bn);
  });
}

function enterCreateMode(preselectProjectId) {
  mode = 'create';
  document.getElementById('search-row').style.display = 'none';
  createLinkEl.style.display = 'none';
  noTaskEl.style.display = 'none';
  listEl.style.display = 'none';
  createFormEl.classList.add('visible');
  createErrorEl.textContent = '';
  createNameEl.value = '';
  populateProjectSelect(preselectProjectId);
  createNameEl.focus();
}

// Fills the Project dropdown from the project list. Called when the form opens AND
// again whenever fresh data arrives while the form is open (the list can still be
// loading, or arrive late on a slow connection, when someone opens the form).
function populateProjectSelect(preselectProjectId) {
  const previouslySelected =
    createProjectEl._projects?.[Number(createProjectEl.value)]?.projectId ?? null;
  const projects = sortedProjects(allProjects);
  if (projects.length === 0) {
    createProjectEl.innerHTML = '';
    createProjectEl.disabled = true;
    createErrorEl.textContent = dataLoaded
      ? 'No projects exist yet — create one in the web app first (Settings → Projects & Tasks).'
      : 'Loading projects…';
  } else {
    createProjectEl.disabled = false;
    createErrorEl.textContent = '';
    createProjectEl.innerHTML = projects
      .map(
        (p, i) =>
          `<option value="${i}">${escapeHtml([p.clientName, p.projectName].filter(Boolean).join(' · '))}</option>`,
      )
      .join('');
    // Reached via a project's "+ Add task" row: start on that project; otherwise keep
    // whatever was already chosen when the list refreshes underneath the person.
    const wanted = typeof preselectProjectId === 'string' ? preselectProjectId : previouslySelected;
    if (wanted) {
      const i = projects.findIndex((p) => p.projectId === wanted);
      if (i >= 0) createProjectEl.value = String(i);
    }
  }
  createProjectEl._projects = projects; // stash for submit, avoids re-parsing option text
}

function exitCreateMode() {
  mode = 'browse';
  document.getElementById('search-row').style.display = '';
  createLinkEl.style.display = '';
  noTaskEl.style.display = '';
  listEl.style.display = '';
  createFormEl.classList.remove('visible');
  searchInput.focus();
}

createLinkEl.addEventListener('click', () => enterCreateMode());
createCancelBtn.addEventListener('click', exitCreateMode);

createSubmitBtn.addEventListener('click', async () => {
  const name = createNameEl.value.trim();
  const projects = createProjectEl._projects ?? [];
  const project = projects[Number(createProjectEl.value)];
  createErrorEl.textContent = '';
  if (!name) {
    createErrorEl.textContent = 'Enter a task name.';
    return;
  }
  if (!project) {
    createErrorEl.textContent = 'Choose a project first — tasks must belong to one.';
    return;
  }
  createSubmitBtn.disabled = true;
  createSubmitBtn.textContent = 'Adding…';
  try {
    const result = await window.taskPicker.createTask({
      projectId: project.projectId,
      projectName: project.projectName,
      clientName: project.clientName,
      name,
      selectAfterCreate: createSelectAfterEl.checked,
    });
    if (result.ok) {
      // If "select after adding" was checked, main.ts already started the
      // timer on it — either way, this picker's done its job.
      window.taskPicker.cancel();
    } else {
      // Surfaces real server-side failures rather than hiding them — most
      // commonly RLS: time_tasks_write requires manage_tasks capability or
      // being that project's manager, so a regular employee creating a task
      // under a project they don't manage gets a real permission error here.
      createErrorEl.textContent = result.error || 'Could not create task.';
    }
  } catch (err) {
    createErrorEl.textContent = 'Could not create task.';
  } finally {
    createSubmitBtn.disabled = false;
    createSubmitBtn.textContent = 'Add task';
  }
});

window.taskPicker.onData(({ tasks, suggested: s, projects }) => {
  allTasks = tasks;
  suggested = s;
  allProjects = projects ?? [];
  dataLoaded = true;
  render();
  // The create form may already be open (data can arrive after it was opened):
  // refill its project list instead of leaving it stuck on "no projects".
  if (mode === 'create') populateProjectSelect();
  // Opened from the tray's "Create New Task…": go straight to the form (once).
  // (task creation from the tracker is switched off, so ?create=1 does nothing)
});

window.taskPicker.requestTasks();
render();
