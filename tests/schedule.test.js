import { describe, it, expect } from 'vitest';
import { finishDate } from '../src/lib/schedule.js';

const WEEKDAYS = [1, 2, 3, 4, 5];
const monday = new Date(2026, 10, 2, 15, 30); // Mon Nov 2 2026, mid-afternoon

describe('finishDate', () => {
  it('reports done when nothing is left', () => {
    expect(finishDate(0, { hoursPerDay: 2, workDays: WEEKDAYS }, monday)).toEqual({ done: true });
  });

  it('returns null when no time is available', () => {
    expect(finishDate(60, { hoursPerDay: 0, workDays: WEEKDAYS }, monday)).toBeNull();
    expect(finishDate(60, { hoursPerDay: 2, workDays: [] }, monday)).toBeNull();
  });

  it('counts today as the first work day', () => {
    const f = finishDate(120, { hoursPerDay: 2, workDays: WEEKDAYS }, monday);
    expect(f.calendarDays).toBe(0);
    expect(f.workDays).toBe(1);
  });

  it('skips days off', () => {
    // 12h at 2h/day on weekdays = 6 work days: Mon–Fri, then the following Mon.
    const f = finishDate(12 * 60, { hoursPerDay: 2, workDays: WEEKDAYS }, monday);
    expect(f.workDays).toBe(6);
    expect(f.date.getDay()).toBe(1);
    expect(f.date.getDate()).toBe(9);
  });

  it('rounds a partial day up', () => {
    const f = finishDate(150, { hoursPerDay: 2, workDays: [0, 1, 2, 3, 4, 5, 6] }, monday);
    expect(f.workDays).toBe(2);
  });
});
