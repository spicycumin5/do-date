import { describe, it, expect } from 'vitest';
import { finishDate, planDays, dayKey } from '../src/lib/schedule.js';

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

describe('planDays', () => {
  const project = (groups, over = {}) => ({
    project: { hoursPerDay: 2, workDays: WEEKDAYS, bufferPct: 0, ...over },
    groups: groups.map((tasks, i) => ({
      id: 'g' + i, color: '#' + i, tasks: tasks.map(([name, minutes, done = false]) => ({ id: name, name, minutes, done })),
    })),
  });
  const names = day => day.items.map(it => it.buffer ? 'buffer' : it.name);

  it('returns null without a pace', () => {
    expect(planDays(project([[['a', 30]]], { hoursPerDay: 0 }), monday)).toBeNull();
    expect(planDays(project([[['a', 30]]], { workDays: [] }), monday)).toBeNull();
  });

  it('is empty when everything is done', () => {
    const p = planDays(project([[['a', 30, true]]]), monday);
    expect(p.days.size).toBe(0);
    expect(p.end).toBeNull();
  });

  it('fills days in list order, skipping done tasks', () => {
    const p = planDays(project([[['a', 60], ['x', 60, true], ['b', 60]], [['c', 60]]]), monday);
    const days = [...p.days.values()];
    expect(days.map(names)).toEqual([['a', 'b'], ['c']]);
    expect(days[0].minutes).toBe(120);
    expect(days[0].items[0]).toMatchObject({ taskId: 'a', groupId: 'g0', color: '#0', part: 1, parts: 1 });
  });

  it('splits a task across days and numbers the parts', () => {
    const p = planDays(project([[['a', 60], ['big', 240]]]), monday);
    const days = [...p.days.values()];
    expect(days.map(names)).toEqual([['a', 'big'], ['big'], ['big']]);
    expect(days.map(d => d.items.at(-1).minutes)).toEqual([60, 120, 60]);
    expect(days.map(d => d.items.at(-1).part)).toEqual([1, 2, 3]);
    expect(days.every(d => d.items.at(-1).parts === 3)).toBe(true);
  });

  it('skips days off', () => {
    const friday = new Date(2026, 10, 6);
    const p = planDays(project([[['a', 120], ['b', 120]]]), friday);
    expect([...p.days.keys()]).toEqual(['2026-11-06', '2026-11-09']);
  });

  it('puts the buffer last and ends on the finish date', () => {
    const s = project([[['a', 120], ['b', 90]]], { bufferPct: 50 });
    const p = planDays(s, monday);
    const days = [...p.days.values()];
    expect(names(days.at(-1)).at(-1)).toBe('buffer');
    const total = days.reduce((a, d) => a + d.minutes, 0);
    expect(total).toBeCloseTo(210 * 1.5);
    expect(dayKey(p.end)).toBe(dayKey(finishDate(210 * 1.5, s.project, monday).date));
  });
});
