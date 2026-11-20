// Several projects per user: the switcher in the top bar, the "new project" sheet, and deleting one.

import { $, $$, esc } from './dom.js';
import { toast } from './toast.js';
import { fmt } from '../lib/duration.js';
import { KINDS, totals, plural } from '../state/model.js';
import { workspace, state, commit, snapshot, switchProject, addProject, removeProject } from '../state/store.js';
import { overviewOpen, showOverview, renderOverview } from './overview.js';

let menuOpen = false;
let newKind = 'music';
let returnFocus = null;

const menu = () => $('#projectMenu');
const menuBtn = () => $('#projectMenuBtn');
const sheet = () => $('#projectSheet');

/* ---------- switcher ---------- */

function left(p) {
  const T = totals(p);
  return T.total ? (T.remaining + T.buffer > 0 ? `${fmt(T.remaining + T.buffer)} left` : 'done') : 'empty';
}

function renderMenu() {
  const ov = overviewOpen();
  const cur = p => !ov && p.id === state.id;
  menu().innerHTML = `
    <button class="pm-all${ov ? ' on' : ''}" data-pm="all"${ov ? ' aria-current="true"' : ''}>All projects</button>
    <div class="pm-head">Your projects</div>
    ${workspace.projects.map(p => `
      <button class="pm-item${cur(p) ? ' on' : ''}" data-pid="${esc(p.id)}"${cur(p) ? ' aria-current="true"' : ''}>
        <span class="pm-name">${esc(p.project.name || 'Untitled project')}</span>
        <span class="pm-sub">${esc(KINDS[p.project.kind]?.label || 'Project')} · ${left(p)}${p.session ? ' · <b>session running</b>' : ''}</span>
      </button>`).join('')}
    <button class="pm-new" data-pm="new">+ New project</button>`;
}

function openMenu() {
  renderMenu();
  menu().hidden = false;
  menuBtn().setAttribute('aria-expanded', 'true');
  menuOpen = true;
  ($('.pm-item.on, .pm-all.on', menu()) || $('.pm-item', menu()))?.focus();
}

function closeMenu(refocus) {
  if (!menuOpen) return;
  menu().hidden = true;
  menuBtn().setAttribute('aria-expanded', 'false');
  menuOpen = false;
  if (refocus) menuBtn().focus();
}

/** Makes another project the active one and redraws everything. */
export function goToProject(id) {
  const wasOverview = overviewOpen();
  if (wasOverview) showOverview(false);
  if (id === state.id) return wasOverview && commit({ list: true, settings: true });
  switchProject(id);
  commit({ list: true, settings: true });
}

export function renderProjects() {
  $('#projectMenuBtn .pm-count').textContent = workspace.projects.length > 1 ? workspace.projects.length : '';
  $('#deleteProject').disabled = workspace.projects.length < 2;
  if (menuOpen) renderMenu();
  renderOverview();
}

/* ---------- new project sheet ---------- */

function renderSheet() {
  const k = KINDS[newKind];
  $('#projectSheetBody').innerHTML = `
    <h2 id="projectSheetTitle">New project</h2>
    <p class="sheet-lede">Each project gets its own tank, finish date and work sessions.</p>

    <div class="field-label" id="kindLabel">What kind of project?</div>
    <div class="kind-grid" role="radiogroup" aria-labelledby="kindLabel">
      ${Object.entries(KINDS).map(([id, x]) => `
        <button class="kind${id === newKind ? ' on' : ''}" role="radio" aria-checked="${id === newKind}" data-kind="${id}">
          <span class="kind-name">${esc(x.label)}</span>
          <span class="kind-sub">Split into ${esc(plural(x.unit))}</span>
        </button>`).join('')}
    </div>

    <label class="field-label" for="newProjName">Name</label>
    <input id="newProjName" class="text-input" maxlength="80" placeholder="${esc(k.name)}" autocomplete="off" spellcheck="false">

    <p class="kind-note">Each ${esc(k.unit)} starts with: ${k.template.map(t => esc(t.name.toLowerCase())).join(', ')}. You can change the template and what the parts are called in Settings.</p>

    <div class="sheet-actions">
      <button class="btn ghost" data-pm="cancel">Cancel</button>
      <button class="btn primary" data-pm="create">Create project</button>
    </div>`;
}

export function openSheet() {
  closeMenu(false);
  returnFocus = document.activeElement?.closest?.('.ov-card') ? document.activeElement : menuBtn();
  newKind = 'music';
  renderSheet();
  sheet().hidden = false;
  document.body.classList.add('sheet-open');
  setTimeout(() => $('.kind.on', sheet())?.focus(), 30);
}

function closeSheet() {
  if (sheet().hidden) return;
  sheet().hidden = true;
  document.body.classList.remove('sheet-open');
  returnFocus?.focus?.();
}

function setKind(kind) {
  const name = $('#newProjName').value;
  newKind = kind;
  renderSheet();
  $('#newProjName').value = name;
  $(`.kind[data-kind="${kind}"]`, sheet())?.focus();
}

function create() {
  const name = $('#newProjName').value.trim() || KINDS[newKind].name;
  const p = addProject(newKind, name);
  if (overviewOpen()) showOverview(false);
  sheet().hidden = true;
  document.body.classList.remove('sheet-open');
  commit({ list: true, settings: true });
  $('#addTemplateGroup')?.focus();
  toast(`Created "${p.project.name}". Add your first ${p.project.unit}.`);
}

/* ---------- delete ---------- */

function deleteCurrent() {
  const name = state.project.name || 'Untitled project';
  const snap = snapshot();
  if (!removeProject(state.id)) return;
  document.body.classList.remove('settings-open');
  commit({ list: true, settings: true });
  toast(`Deleted "${name}"`, snap);
}

export function initProjects() {
  menuBtn().addEventListener('click', () => (menuOpen ? closeMenu(true) : openMenu()));
  menu().addEventListener('click', e => {
    const item = e.target.closest('.pm-item');
    if (item) {
      closeMenu(true);
      return goToProject(item.dataset.pid);
    }
    if (e.target.closest('[data-pm="new"]')) openSheet();
    if (e.target.closest('[data-pm="all"]')) {
      closeMenu(false);
      showOverview(true);
    }
  });
  menu().addEventListener('keydown', e => {
    const items = $$('button', menu());
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      closeMenu(true);
    }
  });
  document.addEventListener('click', e => {
    if (menuOpen && !e.target.closest('.proj-switch')) closeMenu(false);
  });

  const wrap = sheet();
  wrap.addEventListener('click', e => {
    if (e.target === wrap) return closeSheet();
    const kind = e.target.closest('.kind');
    if (kind) return setKind(kind.dataset.kind);
    const act = e.target.closest('[data-pm]')?.dataset.pm;
    if (act === 'cancel') closeSheet();
    if (act === 'create') create();
  });
  wrap.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.stopPropagation(); closeSheet(); }
    if (e.key === 'Enter' && e.target.id === 'newProjName') { e.preventDefault(); create(); }
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && e.target.closest('.kind')) {
      const ids = Object.keys(KINDS);
      e.preventDefault();
      setKind(ids[(ids.indexOf(newKind) + (e.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length]);
    }
  });

  $('#deleteProject').addEventListener('click', deleteCurrent);
}

