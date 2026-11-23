// Suggested schedule: the project's open tasks laid onto upcoming work days at its pace.
// A reference to glance at, not a plan to follow: nothing here is stored, it's recomputed on every change.

import { $, esc } from './dom.js';
import { fmt } from '../lib/duration.js';
import { planDays, dayKey } from '../lib/schedule.js';
import { totals } from '../state/model.js';
import { state } from '../state/store.js';

const VIEW_KEY = 'dodate.calView';
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_BARS = 3;

let view = 'week'; // 'week' | 'month'
let offset = 0; // weeks or months away from the current one
let selected = null; // dayKey picked in the month grid

const root = () => $('#calendar');

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = d => addDays(startOfDay(d), -((d.getDay() + 6) % 7));

/* ---------- pieces ---------- */

function chip(it) {
  if (it.buffer) {
    return `<span class="cal-chip buffer" title="Unknowns buffer"><span class="cc-name">Buffer</span><span class="cc-dur">${fmt(it.minutes)}</span></span>`;
  }
  const part = it.parts > 1 ? `<span class="cc-part">${it.part}/${it.parts}</span>` : '';
  const label = `${it.name || 'Untitled task'}${it.parts > 1 ? ` (part ${it.part} of ${it.parts})` : ''}, ${fmt(it.minutes)}`;
  return `
    <button class="cal-chip" data-tid="${esc(it.taskId)}" style="--c:${esc(it.color)}" title="${esc(label)}">
      <span class="cc-name">${esc(it.name || 'Untitled task')}</span>${part}<span class="cc-dur">${fmt(it.minutes)}</span>
    </button>`;
}

/** What a day looks like: its plan, or why it has none. */
function dayInfo(d, plan, today) {
  const key = dayKey(d);
  const day = plan?.days.get(key);
  return {
    key,
    day,
    past: d < today,
    today: key === dayKey(today),
    off: !state.project.workDays.includes(d.getDay()),
  };
}

function emptyText(info) {
  if (info.past) return '';
  if (info.off) return 'Day off';
  return 'Free';
}

/* ---------- views ---------- */

function weekHTML(plan, today) {
  const start = addDays(today, offset * 7); // the next seven days, not the calendar week: the past has nothing to suggest
  const rows = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const info = dayInfo(d, plan, today);
    const cls = ['cal-day', info.past && 'past', info.today && 'today', info.off && 'off', info.day && 'busy'].filter(Boolean).join(' ');
    rows.push(`
      <li class="${cls}">
        <div class="cd-head">
          <span class="cd-name">${DAY_NAMES[d.getDay()]}</span>
          <span class="cd-date">${d.getDate()}</span>
          ${info.today ? '<span class="cd-today">Today</span>' : ''}
          <span class="cd-total">${info.day ? fmt(info.day.minutes) : ''}</span>
        </div>
        <div class="cd-items">${info.day ? info.day.items.map(chip).join('') : `<span class="cd-empty">${emptyText(info)}</span>`}</div>
      </li>`);
  }
  return `<ol class="cal-week">${rows.join('')}</ol>`;
}

function monthHTML(plan, today) {
  const first = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const gridStart = mondayOf(first);
  const gridEnd = addDays(mondayOf(last), 6);

  // Default selection: today if it's in this month, else the month's first planned day.
  const inMonth = k => k && k.slice(0, 7) === dayKey(first).slice(0, 7);
  if (!inMonth(selected)) {
    selected = inMonth(dayKey(today)) ? dayKey(today)
      : [...(plan?.days.keys() ?? [])].find(inMonth) ?? null;
  }

  const head = [1, 2, 3, 4, 5, 6, 0].map(i => `<span class="cm-dow">${DAY_NAMES[i].slice(0, 2)}</span>`).join('');
  const cells = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) {
    const info = dayInfo(d, plan, today);
    if (d.getMonth() !== first.getMonth()) { cells.push('<span class="cm-cell outside"></span>'); continue; }
    const items = info.day?.items ?? [];
    const bars = items.slice(0, MONTH_BARS).map(it =>
      `<span class="cm-bar${it.buffer ? ' buffer' : ''}"${it.buffer ? '' : ` style="--c:${esc(it.color)}"`}></span>`).join('');
    const cls = ['cm-cell', info.past && 'past', info.today && 'today', info.off && 'off', info.day && 'busy', info.key === selected && 'on'].filter(Boolean).join(' ');
    const label = `${d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}${info.day ? `, ${fmt(info.day.minutes)} planned` : ''}`;
    cells.push(`
      <button class="${cls}" data-day="${info.key}" aria-label="${esc(label)}"${info.key === selected ? ' aria-pressed="true"' : ''}>
        <span class="cm-num">${d.getDate()}</span>
        <span class="cm-bars">${bars}${items.length > MONTH_BARS ? `<span class="cm-more">+${items.length - MONTH_BARS}</span>` : ''}</span>
      </button>`);
  }

  let detail = '';
  if (selected) {
    const [y, m, dd] = selected.split('-').map(Number);
    const d = new Date(y, m - 1, dd);
    const info = dayInfo(d, plan, today);
    detail = `
      <div class="cm-detail">
        <div class="cd-head">
          <span class="cd-name">${esc(d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }))}</span>
          <span class="cd-total">${info.day ? fmt(info.day.minutes) : ''}</span>
        </div>
        <div class="cd-items">${info.day ? info.day.items.map(chip).join('') : `<span class="cd-empty">${emptyText(info) || 'Nothing planned'}</span>`}</div>
      </div>`;
  }
  return `<div class="cal-month"><div class="cm-grid">${head}${cells.join('')}</div>${detail}</div>`;
}

function rangeLabel(today) {
  if (view === 'month') {
    const first = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const opts = { month: 'long' };
    if (first.getFullYear() !== today.getFullYear()) opts.year = 'numeric';
    return first.toLocaleDateString(undefined, opts);
  }
  const start = addDays(today, offset * 7);
  const end = addDays(start, 6);
  const opts = { month: 'short', day: 'numeric' };
  if (end.getFullYear() !== today.getFullYear()) opts.year = 'numeric';
  return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, opts)}`;
}

/* ---------- render ---------- */

export function renderCalendar(s) {
  const el = root();
  if (!el) return;
  const today = startOfDay(new Date());
  const T = totals(s);
  const plan = planDays(s, today);

  let note = '';
  if (!T.total) note = 'Add tasks to see a suggested schedule.';
  else if (T.remaining + T.buffer <= 0) note = 'Nothing left to schedule. Every task is done.';
  else if (!plan) note = 'Set your hours per day and work days to see a schedule.';

  const pace = plan ? `At ${fmt(s.project.hoursPerDay * 60)}/day · a guide, not a plan` : 'A guide, not a plan';
  el.innerHTML = `
    <div class="cal-head">
      <div class="cal-title">
        <h2>Suggested schedule</h2>
        <p>${pace}</p>
      </div>
      <div class="cal-views" role="group" aria-label="Calendar view">
        <button class="cal-view${view === 'week' ? ' on' : ''}" data-cal-view="week" aria-pressed="${view === 'week'}">Week</button>
        <button class="cal-view${view === 'month' ? ' on' : ''}" data-cal-view="month" aria-pressed="${view === 'month'}">Month</button>
      </div>
    </div>
    <div class="cal-nav">
      <button class="icon" data-cal-nav="-1" aria-label="Previous ${view}">‹</button>
      <span class="cal-range" aria-live="polite">${esc(rangeLabel(today))}</span>
      <button class="icon" data-cal-nav="1" aria-label="Next ${view}">›</button>
      <button class="btn cal-today" data-cal-nav="0"${offset === 0 ? ' disabled' : ''}>Today</button>
    </div>
    ${note ? `<p class="cal-note">${note}</p>` : ''}
    ${view === 'week' ? weekHTML(plan, today) : monthHTML(plan, today)}`;
}

export function initCalendar({ onSelectTask }) {
  try {
    if (localStorage.getItem(VIEW_KEY) === 'month') view = 'month';
  } catch (e) { /* storage unavailable */ }

  root().addEventListener('click', e => {
    const task = e.target.closest('.cal-chip[data-tid]');
    if (task) return onSelectTask(task.dataset.tid);

    const v = e.target.closest('[data-cal-view]');
    if (v && v.dataset.calView !== view) {
      view = v.dataset.calView;
      offset = 0;
      try { localStorage.setItem(VIEW_KEY, view); } catch (e) { /* storage unavailable */ }
      return renderCalendar(state);
    }

    const nav = e.target.closest('[data-cal-nav]');
    if (nav) {
      const step = +nav.dataset.calNav;
      offset = step ? offset + step : 0;
      renderCalendar(state);
      // Keep focus on the arrow that was pressed, now that the header was redrawn.
      return $(`[data-cal-nav="${step}"]`, root())?.focus();
    }

    const cell = e.target.closest('.cm-cell[data-day]');
    if (cell) {
      selected = cell.dataset.day;
      renderCalendar(state);
      $(`.cm-cell[data-day="${selected}"]`, root())?.focus();
    }
  });
}
