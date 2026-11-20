// "All projects": every project side by side, with a small tank, what's left, its finish date and session.

import { $, esc } from './dom.js';
import { fmt } from '../lib/duration.js';
import { finishDate } from '../lib/schedule.js';
import { KINDS, totals, unitWords, sessionProgress, weekLoad, workspaceTotals } from '../state/model.js';
import { workspace, commit, switchProject } from '../state/store.js';

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DATE_OPTS = { weekday: 'short', month: 'short', day: 'numeric' };

let open = false;
export const overviewOpen = () => open;

function finishText(p, left) {
  const T = totals(p);
  if (!T.total) return 'No tasks yet';
  const f = finishDate(left, p.project);
  if (f?.done) return '<b>Done</b>';
  if (!f) return 'No pace set';
  const opts = { ...DATE_OPTS };
  if (f.date.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  const when = f.calendarDays === 0 ? 'today' : f.calendarDays === 1 ? 'tomorrow' : f.date.toLocaleDateString(undefined, opts);
  return `Done <b>${when}</b> at ${fmt(p.project.hoursPerDay * 60)}/day`;
}

/** A small vertical tank: what's done as a faint base, then each card's open work in its color, buffer on top. */
function miniTank(p) {
  const T = totals(p);
  if (!T.total) return '<div class="mini-tank empty"></div>';
  const pct = m => ((m / T.capacity) * 100).toFixed(2) + '%';
  const segs = p.groups.map(g => {
    const open = g.tasks.reduce((a, t) => a + (t.done ? 0 : t.minutes), 0);
    return open ? `<span style="height:${pct(open)};background:${esc(g.color)}"></span>` : '';
  }).reverse().join('');
  return `
    <div class="mini-tank" aria-hidden="true">
      ${T.buffer ? `<span class="mt-buffer" style="height:${pct(T.buffer)}"></span>` : ''}
      ${segs}
      <span class="mt-done" style="height:${pct(T.done)}"></span>
    </div>`;
}

function cardHTML(p) {
  const T = totals(p);
  const left = T.remaining + T.buffer;
  const w = unitWords(p);
  const cards = p.groups.length;
  const s = sessionProgress(p);
  const clock = s && (s.left > 0 ? `${fmt(s.left)} left` : s.left === 0 ? "time's up" : `${fmt(-s.left)} over`);
  return `
    <button class="ov-card" data-pid="${esc(p.id)}">
      ${miniTank(p)}
      <span class="ov-body">
        <span class="ov-kind">${esc(KINDS[p.project.kind]?.label || 'Project')} · ${cards} ${esc(cards === 1 ? w.one : w.many)}</span>
        <span class="ov-name">${esc(p.project.name || 'Untitled project')}</span>
        <span class="ov-left">${T.total ? (left > 0 ? `${fmt(left)} left` : 'Drained') : 'Empty'}</span>
        <span class="ov-bar"><span style="width:${T.total ? ((T.done / T.total) * 100).toFixed(1) : 0}%"></span></span>
        <span class="ov-finish">${finishText(p, left)}</span>
        ${s ? `<span class="ov-session">Session running · ${clock} · ${s.done}/${s.planned} cleared</span>` : ''}
      </span>
    </button>`;
}

export function renderOverview() {
  if (!open) return;
  const W = workspaceTotals(workspace);
  const load = weekLoad(workspace);
  const busiest = Math.max(...load);
  const weekly = load.reduce((a, b) => a + b, 0);

  $('#ovSummary').innerHTML = `
    <div class="ov-stat"><b>${fmt(W.left)}</b><span>left across ${workspace.projects.length === 1 ? '1 project' : `${workspace.projects.length} projects`}</span></div>
    <div class="ov-stat"><b>${fmt(Math.round(weekly * 60))}</b><span>a week, at the paces you've set</span></div>
    <div class="ov-week" aria-label="Hours planned per day">
      ${DAY_ORDER.map(d => `
        <span class="ov-day${load[d] > 0 && load[d] === busiest ? ' peak' : ''}">
          <span class="ov-day-bar"><span style="height:${busiest ? ((load[d] / busiest) * 100).toFixed(1) : 0}%"></span></span>
          <span class="ov-day-h">${load[d] ? +load[d].toFixed(2) + 'h' : '–'}</span>
          <span class="ov-day-n">${DAY_NAMES[d]}</span>
        </span>`).join('')}
    </div>
    ${busiest > 10 ? `<p class="ov-warn">That's ${+busiest.toFixed(2)} hours on your busiest day. Something will probably slip; lower a pace in one of the projects to get honest dates.</p>` : ''}`;

  $('#ovGrid').innerHTML = workspace.projects.map(cardHTML).join('') +
    '<button class="ov-card ov-new"><span>+ New project</span></button>';
}

export function showOverview(on) {
  open = on;
  document.body.classList.toggle('overview-open', on);
  $('#overview').hidden = !on;
  $('#workspace').hidden = on;
  if (on) {
    renderOverview();
    document.title = 'All projects · Do Date';
    $('#ovTitle').focus();
  }
}

export function initOverview({ onNewProject }) {
  $('#ovGrid').addEventListener('click', e => {
    if (e.target.closest('.ov-new')) return onNewProject();
    const card = e.target.closest('.ov-card[data-pid]');
    if (!card) return;
    switchProject(card.dataset.pid);
    showOverview(false);
    commit({ list: true, settings: true });
    $('#projectMenuBtn').focus();
  });
}
