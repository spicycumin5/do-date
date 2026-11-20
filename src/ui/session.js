// Work sessions: plan what you'll clear, work against a countdown, then review what got done.

import { $, $$, esc } from './dom.js';
import { toast } from './toast.js';
import { fmt, parseDuration } from '../lib/duration.js';
import { suggestTasks, startSession, sessionProgress, endSession, kindOf } from '../state/model.js';
import { workspace, state, commit, snapshot } from '../state/store.js';
import { goToProject } from './projects.js';

const TICK_MS = 30000;
const LENGTH_CHIPS = [25, 60, 90, 120];
const HISTORY_SHOWN = 5;

let mode = null; // 'plan' | 'review' while the sheet is open
let pickedByHand = false; // once the user ticks boxes themselves, changing the length stops re-suggesting
let lastProgress = { id: null, done: 0 }; // to notice the moment the last planned task is cleared
let returnFocus = null;

const sheet = () => $('#sessionSheet');
const body = () => $('#sessionSheetBody');

/* ---------- bar under the tank ---------- */

function clockText(p) {
  if (p.left > 0) return `${fmt(p.left)} left`;
  return p.left === 0 ? "time's up" : `${fmt(-p.left)} over`;
}

export function renderSession(s) {
  const bar = $('#sessionBar');
  const p = sessionProgress(s);
  // One session at a time, across all projects.
  const elsewhere = !p && workspace.projects.find(x => x !== s && x.session);
  if (elsewhere) {
    const ep = sessionProgress(elsewhere);
    bar.innerHTML = `
      <div class="session-elsewhere">
        <span>A session is running in <b>${esc(elsewhere.project.name || 'another project')}</b> · ${clockText(ep)}</span>
        <button class="btn" data-ses="goto" data-pid="${esc(elsewhere.id)}">Go to it</button>
      </div>`;
  } else if (!p) {
    bar.innerHTML = `
      <button class="session-start" data-ses="plan">
        <span class="ss-title">Start a work session</span>
        <span class="ss-sub">Decide what you'll clear before you begin</span>
      </button>`;
  } else {
    const pct = p.plannedTotal ? (p.doneMinutes / p.plannedTotal) * 100 : 0;
    const intent = s.session.intent || (p.planned === 1 ? 'Clear 1 task' : `Clear ${p.planned} tasks`);
    bar.innerHTML = `
      <div class="session-card">
        <div class="ses-top">
          <span class="ses-label">This session</span>
          <span class="ses-clock${p.left <= 0 ? ' over' : ''}" id="sesClock">${clockText(p)}</span>
        </div>
        <div class="ses-intent">${esc(intent)}</div>
        <div class="ses-bar"><span style="width:${pct.toFixed(1)}%"></span></div>
        <div class="ses-foot">
          <span class="ses-count"><b>${p.done} of ${p.planned}</b> cleared${p.extra.length ? ` · +${p.extra.length} extra` : ''}</span>
          <button class="btn" data-ses="end">End session</button>
        </div>
      </div>`;
    const id = s.session.id;
    if (lastProgress.id === id && lastProgress.done < p.planned && p.done === p.planned && p.planned > 0) {
      toast('Everything you planned is cleared. End the session when you’re ready.');
    }
    lastProgress = { id, done: p.done };
  }
  renderHistory(s);
}

function tick() {
  const el = $('#sesClock');
  const p = sessionProgress(state);
  if (!el || !p) return;
  el.textContent = clockText(p);
  el.classList.toggle('over', p.left <= 0);
}

/* ---------- history in the settings drawer ---------- */

function renderHistory(s) {
  const recent = s.sessions.slice(-HISTORY_SHOWN).reverse();
  $('#historySection').hidden = !recent.length;
  $('#sessionHistory').innerHTML = recent.map(e => {
    const date = new Date(e.startedAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const done = e.planned.filter(t => t.done).length;
    const worked = Math.round((e.endedAt - e.startedAt) / 60000);
    return `
      <li>
        <div class="h-top"><b>${esc(date)}</b> · ${done}/${e.planned.length} cleared · ${fmt(worked)}</div>
        ${e.intent ? `<div class="h-intent">${esc(e.intent)}</div>` : ''}
        ${e.note ? `<div class="h-note">${esc(e.note)}</div>` : ''}
      </li>`;
  }).join('');
}

/* ---------- the sheet ---------- */

function openSheet(m) {
  mode = m;
  returnFocus = document.activeElement;
  m === 'plan' ? renderPlan() : renderReview();
  sheet().hidden = false;
  document.body.classList.add('sheet-open');
  setTimeout(() => (m === 'plan' ? $('#sesLen') : $('#sesNote'))?.focus(), 30);
}

function closeSheet() {
  if (!mode) return;
  mode = null;
  sheet().hidden = true;
  document.body.classList.remove('sheet-open');
  (document.contains(returnFocus) ? returnFocus : $('#sessionBar button'))?.focus?.();
}

function defaultLength() {
  return Math.round(state.project.hoursPerDay * 60) || 60;
}

function renderPlan() {
  pickedByHand = false;
  const groups = state.groups.map(g => ({ g, open: g.tasks.filter(t => !t.done) })).filter(x => x.open.length);
  if (!groups.length) {
    body().innerHTML = `
      <h2 id="sheetTitle">Plan this session</h2>
      <p class="sheet-lede">Nothing is left in the tank to plan. Add some tasks first.</p>
      <div class="sheet-actions"><button class="btn primary" data-ses="cancel">OK</button></div>`;
    return;
  }
  const len = defaultLength();
  const picked = new Set(suggestTasks(state, len));
  body().innerHTML = `
    <h2 id="sheetTitle">Plan this session</h2>
    <p class="sheet-lede">Choose what you’ll clear before you start, so the time goes to the right blocks.</p>

    <label class="field-label" for="sesLen">How long are you working?</label>
    <div class="len-row">
      <input id="sesLen" class="text-input len-input" value="${fmt(len)}" spellcheck="false" autocomplete="off">
      ${LENGTH_CHIPS.map(m => `<button class="chip" data-len="${m}">${fmt(m)}</button>`).join('')}
    </div>

    <div class="field-label">What will you clear?</div>
    <div class="pick-list">
      ${groups.map(({ g, open }) => `
        <div class="pick-group" style="--c:${esc(g.color)}">
          <div class="pick-group-name">${esc(g.name || 'Untitled')}</div>
          ${open.map(t => `
            <label class="pick">
              <input type="checkbox" value="${t.id}" data-min="${t.minutes}"${picked.has(t.id) ? ' checked' : ''}>
              <span class="pick-box"></span>
              <span class="pick-name">${esc(t.name || 'Untitled task')}</span>
              <span class="pick-dur">${fmt(t.minutes)}</span>
            </label>`).join('')}
        </div>`).join('')}
    </div>
    <div class="fit" id="sesFit" aria-live="polite"></div>

    <label class="field-label" for="sesIntent">What does done look like? <span class="opt">optional</span></label>
    <input id="sesIntent" class="text-input" maxlength="140" placeholder="e.g. ${esc(kindOf(state).goal)}" autocomplete="off">

    <div class="sheet-actions">
      <button class="btn ghost" data-ses="cancel">Cancel</button>
      <button class="btn primary" data-ses="start" id="sesStart">Start session</button>
    </div>`;
  updateFit();
}

const pickBoxes = () => $$('.pick input', body());

function updateFit() {
  const len = parseDuration($('#sesLen').value);
  const boxes = pickBoxes().filter(b => b.checked);
  const sum = boxes.reduce((a, b) => a + +b.dataset.min, 0);
  const fit = $('#sesFit');
  $('#sesStart').disabled = !boxes.length || !len;
  $$('.chip', body()).forEach(c => c.classList.toggle('on', +c.dataset.len === len));
  fit.className = 'fit';
  if (!len) {
    fit.textContent = 'Try a length like 45m, 1h30 or 2h.';
    fit.classList.add('warn');
  } else if (!boxes.length) {
    fit.textContent = 'Pick at least one block to clear.';
  } else if (sum > len) {
    fit.innerHTML = `<b>${fmt(sum)}</b> picked for a <b>${fmt(len)}</b> session: ${fmt(sum - len)} more than you have. Drop something, or plan for more time.`;
    fit.classList.add('warn');
  } else {
    fit.innerHTML = `<b>${fmt(sum)}</b> picked of <b>${fmt(len)}</b>${sum < len ? ` · ${fmt(len - sum)} of slack` : ' · a full session'}`;
    fit.classList.add('ok');
  }
}

function setLength(min) {
  if (!pickedByHand) {
    const picked = new Set(suggestTasks(state, min));
    pickBoxes().forEach(b => { b.checked = picked.has(b.value); });
  }
  updateFit();
}

function start() {
  const len = parseDuration($('#sesLen').value);
  const taskIds = pickBoxes().filter(b => b.checked).map(b => b.value);
  if (!len || !taskIds.length) return updateFit();
  startSession(state, { taskIds, plannedMinutes: len, intent: $('#sesIntent').value });
  mode = null; // close without restoring focus to the old button, which is about to be replaced
  sheet().hidden = true;
  document.body.classList.remove('sheet-open');
  commit({ list: true });
  $('#sessionBar [data-ses="end"]')?.focus();
}

function renderReview() {
  const s = state.session;
  const p = sessionProgress(state);
  const row = t => `
    <li class="${t.done ? 'done' : 'open'}">
      <span class="r-mark" aria-hidden="true">${t.done ? '✓' : '○'}</span>
      <span class="r-name">${esc(t.name || 'Untitled task')}</span>
      <span class="r-dur">${fmt(t.minutes)}</span>
    </li>`;
  body().innerHTML = `
    <h2 id="sheetTitle">How did it go?</h2>
    ${s.intent ? `<p class="sheet-lede">You set out to: <b>${esc(s.intent)}</b></p>` : ''}
    <div class="review-sum">
      Cleared <b>${p.done} of ${p.planned}</b> planned (${fmt(p.doneMinutes)} of ${fmt(p.plannedTotal)})
      · worked <b>${fmt(p.elapsed)}</b> of ${fmt(s.plannedMinutes)}
    </div>
    <ul class="review-list">${p.tasks.map(row).join('') || '<li class="open"><span class="r-name">The planned tasks were removed.</span></li>'}</ul>
    ${p.extra.length ? `<div class="field-label">Also finished</div><ul class="review-list">${p.extra.map(row).join('')}</ul>` : ''}
    ${p.done < p.planned ? '<p class="review-hint">Unfinished tasks stay in your list for next time.</p>' : ''}

    <label class="field-label" for="sesNote">Notes for next time <span class="opt">optional</span></label>
    <textarea id="sesNote" class="note-input" placeholder="What got in the way? What should the next session start with?"></textarea>

    <div class="sheet-actions">
      <button class="btn ghost" data-ses="cancel">Keep working</button>
      <button class="btn primary" data-ses="save">Save &amp; end</button>
    </div>`;
}

function save() {
  const snap = snapshot();
  const entry = endSession(state, $('#sesNote').value);
  mode = null;
  sheet().hidden = true;
  document.body.classList.remove('sheet-open');
  commit({ list: true });
  $('#sessionBar [data-ses="plan"]')?.focus();
  const done = entry.planned.filter(t => t.done).length;
  toast(`Session saved: ${done} of ${entry.planned.length} cleared`, snap);
}

export function initSession() {
  document.addEventListener('click', e => {
    const lenChip = e.target.closest('.chip[data-len]');
    if (lenChip) {
      $('#sesLen').value = fmt(+lenChip.dataset.len);
      return setLength(+lenChip.dataset.len);
    }
    const btn = e.target.closest('[data-ses]');
    if (!btn) return;
    switch (btn.dataset.ses) {
      case 'plan': return openSheet('plan');
      case 'end': return openSheet('review');
      case 'cancel': return closeSheet();
      case 'start': return start();
      case 'save': return save();
      case 'goto': return goToProject(btn.dataset.pid);
    }
  });

  const wrap = sheet();
  wrap.addEventListener('click', e => { if (e.target === wrap) closeSheet(); });
  wrap.addEventListener('change', e => {
    if (e.target.matches('.pick input')) { pickedByHand = true; updateFit(); }
  });
  wrap.addEventListener('input', e => {
    if (e.target.id === 'sesLen') {
      const m = parseDuration(e.target.value);
      m ? setLength(m) : updateFit();
    }
  });
  wrap.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.stopPropagation(); closeSheet(); }
    if (e.key === 'Enter' && mode === 'plan' && e.target.matches('.text-input')) { e.preventDefault(); start(); }
  });

  setInterval(tick, TICK_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
}
