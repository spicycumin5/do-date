// Song cards and their tasks: rendering, inline editing, quick-add, deletes and drag-to-reorder.

import { $, $$, esc, scrollBehavior } from './dom.js';
import { toast } from './toast.js';
import { fmt, parseDuration, parseQuick } from '../lib/duration.js';
import { PALETTE, createGroup, createTask, groupTotals } from '../state/model.js';
import { state, commit, snapshot, logEvent, findTask, findGroup } from '../state/store.js';

const groupsEl = () => $('#groups');

function taskHTML(t) {
  return `
    <li class="task${t.done ? ' done' : ''}" data-tid="${t.id}">
      <label class="check"><input type="checkbox" data-act="toggle" ${t.done ? 'checked' : ''} aria-label="Mark done"><span></span></label>
      <input class="t-name" data-field="tname" value="${esc(t.name)}" aria-label="Task name" spellcheck="false">
      <input class="t-dur" data-field="tdur" value="${fmt(t.minutes)}" aria-label="Time estimate" spellcheck="false">
      <button class="icon del" data-act="deltask" aria-label="Delete task">✕</button>
    </li>`;
}

function groupHTML(g) {
  const { total, remaining, doneCount } = groupTotals(g);
  const pct = total ? ((total - remaining) / total) * 100 : 0;
  const meta = !g.tasks.length ? 'empty'
    : remaining === 0 ? `done · ${fmt(total)}` : `${fmt(remaining)} left · ${doneCount}/${g.tasks.length}`;
  const ordered = [...g.tasks.filter(t => !t.done), ...g.tasks.filter(t => t.done)];
  return `
    <article class="group${g.collapsed ? ' collapsed' : ''}" data-gid="${g.id}" style="--c:${esc(g.color)}">
      <header class="g-head">
        <span class="handle" title="Drag to reorder" aria-hidden="true">⋮⋮</span>
        <button class="swatch" data-act="color" aria-label="Change color" title="Change color"></button>
        <input class="g-name" data-field="gname" value="${esc(g.name)}" aria-label="Song name" spellcheck="false">
        <span class="g-meta">${meta}</span>
        <button class="icon" data-act="collapse" aria-label="${g.collapsed ? 'Expand' : 'Collapse'}"><span class="chev">▾</span></button>
        <button class="icon del" data-act="delgroup" aria-label="Delete song">✕</button>
      </header>
      <div class="g-bar"><span style="width:${pct.toFixed(1)}%"></span></div>
      <ul class="tasks">${ordered.map(taskHTML).join('')}</ul>
      <div class="quick-wrap">
        <input class="quick" data-gid="${g.id}" placeholder="Add a task… e.g. record vocals 30m" aria-label="Add a task to ${esc(g.name)}" spellcheck="false">
      </div>
    </article>`;
}

export function renderList(s, focusQuick) {
  const el = groupsEl();
  el.innerHTML = s.groups.length
    ? s.groups.map(groupHTML).join('')
    : '<div class="empty"><h3>No songs yet</h3>Add a song, then list everything it still needs, with a time for each.</div>';
  $('#sampleBanner').hidden = !s.sample;
  if (focusQuick) el.querySelector(`.quick[data-gid="${focusQuick}"]`)?.focus();
}

/** Scrolls to a task's row (expanding its song if needed) and flashes it. */
export function revealTask(tid) {
  const f = findTask(tid);
  if (!f) return;
  if (f.g.collapsed) {
    f.g.collapsed = false;
    commit({ list: true });
  }
  const row = $(`.task[data-tid="${tid}"]`);
  if (!row) return;
  row.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
  row.classList.remove('flash');
  void row.offsetWidth;
  row.classList.add('flash');
}

function addGroup(fromTemplate) {
  const tasks = fromTemplate ? state.template.map(t => createTask(t.name, t.minutes)) : [];
  const g = createGroup(state, `Song ${state.groups.length + 1}`, tasks);
  state.groups.push(g);
  const added = tasks.reduce((a, t) => a + t.minutes, 0);
  if (added) logEvent('add', added);
  commit({ list: true, float: added ? { text: `+${fmt(added)} added`, cls: 'add' } : null });

  const card = $(`.group[data-gid="${g.id}"]`);
  if (card) {
    card.scrollIntoView({ behavior: scrollBehavior(), block: 'nearest' });
    const name = card.querySelector('.g-name');
    name.focus();
    name.select();
  }
}

function onClick(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn || btn.dataset.act === 'toggle') return;
  const card = btn.closest('.group');
  const g = card && findGroup(card.dataset.gid);
  if (!g) return;

  switch (btn.dataset.act) {
    case 'collapse':
      g.collapsed = !g.collapsed;
      commit({ list: true });
      break;
    case 'color':
      g.color = PALETTE[(PALETTE.indexOf(g.color) + 1) % PALETTE.length];
      commit({ list: true });
      break;
    case 'delgroup': {
      const snap = snapshot();
      state.groups.splice(state.groups.indexOf(g), 1);
      commit({ list: true });
      toast(`Deleted "${g.name}"`, snap);
      break;
    }
    case 'deltask': {
      const f = findTask(btn.closest('.task').dataset.tid);
      if (!f) return;
      const snap = snapshot();
      f.g.tasks.splice(f.i, 1);
      if (!f.t.done) logEvent('delete', -f.t.minutes);
      commit({ list: true });
      toast(`Removed "${f.t.name || 'task'}"`, snap);
      break;
    }
  }
}

function onChange(e) {
  const el = e.target;
  if (el.matches('[data-act="toggle"]')) {
    const f = findTask(el.closest('.task').dataset.tid);
    if (!f) return;
    f.t.done = el.checked;
    f.t.doneAt = f.t.done ? Date.now() : null;
    logEvent(f.t.done ? 'done' : 'undo', f.t.minutes);
    commit({
      list: true,
      float: f.t.done ? { text: `−${fmt(f.t.minutes)} ✓`, cls: 'done' } : { text: `+${fmt(f.t.minutes)} back`, cls: 'add' },
    });
  } else if (el.dataset.field === 'tdur') {
    const f = findTask(el.closest('.task').dataset.tid);
    if (!f) return;
    const m = parseDuration(el.value);
    if (!m) {
      el.value = fmt(f.t.minutes);
      toast('Try a time like 30m, 1h, 1h30 or 1.5h');
      return;
    }
    const delta = m - f.t.minutes;
    el.value = fmt(m);
    if (!delta) return;
    f.t.minutes = m;
    let float = null;
    if (!f.t.done) {
      logEvent('edit', delta);
      float = delta > 0 ? { text: `+${fmt(delta)} added`, cls: 'add' } : { text: `−${fmt(-delta)}`, cls: 'done' };
    }
    commit({ list: true, float });
  }
}

function onInput(e) {
  const el = e.target;
  if (el.dataset.field === 'gname') {
    const g = findGroup(el.closest('.group').dataset.gid);
    if (g) { g.name = el.value; commit(); }
  } else if (el.dataset.field === 'tname') {
    const f = findTask(el.closest('.task').dataset.tid);
    if (f) { f.t.name = el.value; commit(); }
  }
}

function onKeydown(e) {
  const el = e.target;
  if (el.classList.contains('quick') && e.key === 'Enter') {
    e.preventDefault();
    const text = el.value.trim();
    const g = text && findGroup(el.dataset.gid);
    if (!g) return;
    const q = parseQuick(text);
    g.tasks.push(createTask(q.name, q.minutes));
    logEvent('add', q.minutes);
    commit({ list: true, focusQuick: g.id, float: { text: `+${fmt(q.minutes)} added`, cls: 'add' } });
    if (!q.explicit) toast(`No time given, so "${q.name}" got ${fmt(q.minutes)}. Edit it any time.`);
  } else if ((el.dataset.field === 'tname' || el.dataset.field === 'gname') && e.key === 'Enter') {
    el.blur();
  } else if (el.dataset.field === 'tdur') {
    if (e.key === 'Enter') el.blur();
    if (e.key === 'Escape') {
      const f = findTask(el.closest('.task').dataset.tid);
      if (f) el.value = fmt(f.t.minutes);
      el.blur();
    }
  }
}

function initDrag(root) {
  let dragGid = null;
  const clearDrop = () => $$('.drop-before,.drop-after', root).forEach(c => c.classList.remove('drop-before', 'drop-after'));
  const endDrag = () => {
    clearDrop();
    $$('.group', root).forEach(c => { c.draggable = false; c.classList.remove('dragging'); });
    dragGid = null;
  };

  // Cards only become draggable while grabbed by the handle, so inputs stay selectable.
  root.addEventListener('pointerdown', e => {
    const h = e.target.closest('.handle');
    if (h) h.closest('.group').draggable = true;
  });
  root.addEventListener('dragstart', e => {
    const card = e.target.closest('.group');
    if (!card) return;
    dragGid = card.dataset.gid;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragGid);
  });
  root.addEventListener('dragover', e => {
    if (!dragGid) return;
    e.preventDefault();
    const card = e.target.closest('.group');
    clearDrop();
    if (!card || card.dataset.gid === dragGid) return;
    const r = card.getBoundingClientRect();
    card.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
  });
  root.addEventListener('drop', e => {
    if (!dragGid) return;
    e.preventDefault();
    const target = $('.drop-before,.drop-after', root);
    if (target) {
      const from = state.groups.findIndex(g => g.id === dragGid);
      const [moved] = state.groups.splice(from, 1);
      let to = state.groups.findIndex(g => g.id === target.dataset.gid);
      if (target.classList.contains('drop-after')) to++;
      state.groups.splice(to, 0, moved);
    }
    endDrag();
    commit({ list: true });
  });
  root.addEventListener('dragend', endDrag);
}

/** `onHoverTask(tid | null)` lets the tank highlight the slice for the hovered row. */
export function initList({ onHoverTask }) {
  const root = groupsEl();
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);
  root.addEventListener('keydown', onKeydown);
  root.addEventListener('mouseover', e => onHoverTask(e.target.closest('.task')?.dataset.tid ?? null));
  root.addEventListener('mouseleave', () => onHoverTask(null));
  initDrag(root);

  $('#addGroup').addEventListener('click', () => addGroup(false));
  $('#addTemplateGroup').addEventListener('click', () => addGroup(true));
}
