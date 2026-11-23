// Projects remaining work onto the calendar.

import { totals } from '../state/model.js';

const MAX_DAYS = 3660;

/**
 * Walks forward from `today`, spending `hoursPerDay` on each work day, until `minutes` are used up.
 * Returns { done: true } when nothing is left, null when no progress is possible,
 * otherwise { date, workDays, calendarDays }.
 */
export function finishDate(minutes, { hoursPerDay, workDays }, today = new Date()) {
  if (minutes <= 0) return { done: true };
  const perDay = hoursPerDay * 60;
  if (perDay <= 0 || !workDays.length) return null;
  const d = new Date(today);
  d.setHours(0, 0, 0, 0);
  let left = minutes, worked = 0;
  for (let i = 0; i < MAX_DAYS; i++) {
    if (workDays.includes(d.getDay())) {
      left -= perDay;
      worked++;
      if (left <= 0) return { date: d, workDays: worked, calendarDays: i };
    }
    d.setDate(d.getDate() + 1);
  }
  return null;
}

/** Local calendar date as 'YYYY-MM-DD', for keying days. */
export const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Lays a project's open tasks onto upcoming work days at its pace: a suggestion, not a commitment.
 * Uses the same walk as finishDate, so the last planned day is the finish date. Tasks keep list order;
 * one bigger than what's left of a day carries over (part 1 of 2, …). The unknowns buffer goes last.
 * Returns null when there's no pace, otherwise { days: Map<dayKey, { date, items, minutes }>, end }.
 * Items are { taskId, groupId, name, color, minutes, part, parts } or { buffer: true, minutes }.
 */
export function planDays(state, today = new Date()) {
  const { hoursPerDay, workDays } = state.project;
  const perDay = hoursPerDay * 60;
  if (perDay <= 0 || !workDays.length) return null;

  const queue = [];
  for (const g of state.groups) for (const t of g.tasks) {
    if (!t.done) queue.push({ taskId: t.id, groupId: g.id, name: t.name, color: g.color, minutes: t.minutes });
  }
  const { buffer } = totals(state);
  if (buffer > 0) queue.push({ buffer: true, minutes: buffer });

  const days = new Map();
  let end = null;
  const d = new Date(today);
  d.setHours(0, 0, 0, 0);
  let q = 0, left = queue[0]?.minutes ?? 0, part = 1;
  for (let i = 0; i < MAX_DAYS && q < queue.length; i++, d.setDate(d.getDate() + 1)) {
    if (!workDays.includes(d.getDay())) continue;
    const day = { date: new Date(d), items: [], minutes: 0 };
    let room = perDay;
    while (q < queue.length && room > 1e-9) {
      const item = queue[q];
      const take = Math.min(room, left);
      day.items.push({ ...item, minutes: take, part });
      day.minutes += take;
      room -= take;
      left -= take;
      if (left > 1e-9) { part++; continue; }
      q++;
      left = queue[q]?.minutes ?? 0;
      part = 1;
    }
    days.set(dayKey(day.date), day);
    end = day.date;
  }
  // Now that every part is placed, record how many each task was split into.
  const parts = new Map();
  for (const day of days.values()) for (const it of day.items) parts.set(it.taskId ?? 'buffer', it.part);
  for (const day of days.values()) for (const it of day.items) it.parts = parts.get(it.taskId ?? 'buffer');
  return { days, end };
}
