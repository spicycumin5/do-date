import { describe, it, expect } from 'vitest';
import {
  PALETTE, emptyState, sampleState, normalize, totals, groupTotals, nextColor, appendLog, weeklyScope, createTask,
} from '../src/state/model.js';

function stateWith(tasks, bufferPct = 0) {
  const s = emptyState();
  s.project.bufferPct = bufferPct;
  s.groups = [{ id: 'g1', name: 'Song', color: PALETTE[0], collapsed: false, tasks }];
  return s;
}

describe('totals', () => {
  it('splits done and remaining work', () => {
    const T = totals(stateWith([createTask('a', 60, true), createTask('b', 30)]));
    expect(T).toMatchObject({ total: 90, remaining: 30, done: 60, buffer: 0, capacity: 90 });
  });

  it('scales the buffer with what is left', () => {
    const T = totals(stateWith([createTask('a', 60, true), createTask('b', 60)], 50));
    expect(T.buffer).toBe(30);
    expect(T.capacity).toBe(180);
  });

  it('is zero for an empty project', () => {
    expect(totals(emptyState())).toMatchObject({ total: 0, remaining: 0, capacity: 0 });
  });
});

describe('groupTotals', () => {
  it('counts per song', () => {
    const s = stateWith([createTask('a', 60, true), createTask('b', 45), createTask('c', 15)]);
    expect(groupTotals(s.groups[0])).toEqual({ total: 120, remaining: 60, doneCount: 1 });
  });
});

describe('normalize', () => {
  it('rejects data that is not a project', () => {
    expect(normalize(null)).toBeNull();
    expect(normalize({ foo: 1 })).toBeNull();
  });

  it('round-trips the sample', () => {
    const s = sampleState();
    expect(normalize(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('repairs bad values', () => {
    const s = normalize({
      project: { hoursPerDay: 99, workDays: [1, 9, 'x'], bufferPct: -5 },
      groups: [{ name: 'Song', tasks: [{ name: 'a', minutes: 'nope' }, { minutes: 1.4 }] }],
    });
    expect(s.project.hoursPerDay).toBe(24);
    expect(s.project.workDays).toEqual([1]);
    expect(s.project.bufferPct).toBe(0);
    expect(s.groups[0].color).toBe(PALETTE[0]);
    expect(s.groups[0].tasks.map(t => t.minutes)).toEqual([30, 1]);
    expect(s.groups[0].tasks[1].name).toBe('');
  });
});

describe('nextColor', () => {
  it('picks the first unused color', () => {
    const s = stateWith([]);
    expect(nextColor(s)).toBe(PALETTE[1]);
  });
});

describe('weeklyScope', () => {
  it('sums the last 7 days only', () => {
    const now = Date.UTC(2026, 10, 10);
    const s = emptyState();
    appendLog(s, 'add', 60, now - 864e5);
    appendLog(s, 'edit', -15, now - 864e5);
    appendLog(s, 'undo', 30, now - 864e5);
    appendLog(s, 'done', 45, now - 864e5);
    appendLog(s, 'delete', -90, now - 864e5);
    appendLog(s, 'add', 500, now - 8 * 864e5);
    expect(weeklyScope(s.log, now)).toEqual({ added: 75, finished: 45 });
  });
});
