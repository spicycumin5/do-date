// Headline numbers above the tank, the finish date, and the weekly scope line below it.

import { $ } from './dom.js';
import { fmt } from '../lib/duration.js';
import { finishDate } from '../lib/schedule.js';
import { totals, weeklyScope } from '../state/model.js';

export function renderStats(state) {
  const T = totals(state);
  const left = T.remaining + T.buffer;
  $('#statLeft').textContent = fmt(left);
  $('#statLabel').textContent = T.total === 0 ? 'nothing in the tank yet'
    : left <= 0 ? 'the tank is empty' : 'left in the tank';

  const pct = T.total ? Math.round((T.done / T.total) * 100) : 0;
  $('#statSub').innerHTML = !T.total ? ''
    : T.buffer > 0
      ? `<b>${fmt(T.remaining)}</b> of tasks + <b>${fmt(T.buffer)}</b> buffer · ${pct}% of ${fmt(T.total)} done`
      : `${pct}% of <b>${fmt(T.total)}</b> done`;

  $('#statFinish').innerHTML = finishText(state, T, left);
  $('#scopeLog').innerHTML = scopeText(state.log);
}

function finishText(state, T, left) {
  if (!T.total) return 'Add tasks to see your finish date';
  const f = finishDate(left, state.project);
  if (f && f.done) return '<b>Done.</b> Every task is finished';
  if (!f) return 'Set your hours per day to get a finish date';

  const today = new Date();
  const opts = { weekday: 'short', month: 'short', day: 'numeric' };
  if (f.date.getFullYear() !== today.getFullYear()) opts.year = 'numeric';
  const when = f.calendarDays === 0 ? 'today' : f.calendarDays === 1 ? 'tomorrow' : f.date.toLocaleDateString(undefined, opts);
  const span = f.workDays === 1 ? '1 work day' : `${f.workDays} work days`;
  return `At ${fmt(state.project.hoursPerDay * 60)}/day → done <b>${when}</b> · ${span}`;
}

function scopeText(log) {
  const { added, finished } = weeklyScope(log);
  if (added <= 0 && finished <= 0) return '';
  let html = `Last 7 days: <span class="up">+${fmt(Math.max(0, added))} added</span> · <span class="down">−${fmt(finished)} finished</span>`;
  if (added > finished) html += ' · filling faster than it drains';
  else if (finished > added) html += ' · draining';
  return html;
}
