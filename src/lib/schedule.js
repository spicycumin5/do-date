// Projects remaining work onto the calendar.

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
