import { describe, it, expect } from 'vitest';
import {
  PALETTE, emptyState, sampleState, normalize, totals, groupTotals, nextColor, appendLog, weeklyScope, createTask,
  suggestTasks, startSession, sessionProgress, endSession,
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

describe('work sessions', () => {
  const T0 = 1_700_000_000_000;

  it('suggests open tasks in order while they fit the budget', () => {
    const [a, b, c, d] = [createTask('a', 60, true), createTask('b', 45), createTask('c', 30), createTask('d', 60)];
    const s = stateWith([a, b, c, d]);
    expect(suggestTasks(s, 90)).toEqual([b.id, c.id]);
    expect(suggestTasks(s, 20)).toEqual([b.id]); // always at least one
    expect(suggestTasks(stateWith([a]), 60)).toEqual([]);
  });

  it('tracks planned tasks, extra finished tasks and the clock', () => {
    const [a, b, c, old] = [createTask('a', 60), createTask('b', 30), createTask('c', 15), createTask('old', 10, true)];
    old.doneAt = T0 - 1000;
    const s = stateWith([a, b, c, old]);
    startSession(s, { taskIds: [a.id, b.id], plannedMinutes: 90, intent: '  vocals  ' }, T0);
    expect(s.session.intent).toBe('vocals');

    a.done = true; a.doneAt = T0 + 1000;
    c.done = true; c.doneAt = T0 + 2000;
    const p = sessionProgress(s, T0 + 100 * 60000);
    expect(p).toMatchObject({ planned: 2, done: 1, plannedTotal: 90, doneMinutes: 60, elapsed: 100, left: -10 });
    expect(p.extra.map(t => t.id)).toEqual([c.id]);
  });

  it('files the session into history and clears it', () => {
    const [a, b] = [createTask('a', 60), createTask('b', 30)];
    const s = stateWith([a, b]);
    startSession(s, { taskIds: [a.id, b.id], plannedMinutes: 90 }, T0);
    b.done = true; b.doneAt = T0 + 5;
    const e = endSession(s, ' tired ', T0 + 3600000);
    expect(s.session).toBeNull();
    expect(s.sessions).toHaveLength(1);
    expect(e).toMatchObject({ startedAt: T0, endedAt: T0 + 3600000, note: 'tired', plannedMinutes: 90 });
    expect(e.planned.map(t => [t.name, t.done])).toEqual([['a', false], ['b', true]]);
    expect(endSession(s)).toBeNull();
  });

  it('survives normalize, dropping planned tasks that no longer exist', () => {
    const a = createTask('a', 60);
    const s = stateWith([a]);
    startSession(s, { taskIds: [a.id, 'gone'], plannedMinutes: 60, intent: 'x' }, T0);
    s.sessions.push({ id: 'h', startedAt: T0 - 5000, endedAt: T0 - 1000, planned: [{ id: 'q', name: 'q', minutes: 5, done: true }] });
    const n = normalize(JSON.parse(JSON.stringify(s)));
    expect(n.session).toMatchObject({ startedAt: T0, plannedMinutes: 60, intent: 'x', taskIds: [a.id] });
    expect(n.sessions).toHaveLength(1);
    expect(n.sessions[0]).toMatchObject({ note: '', intent: '', extra: [] });
    expect(normalize({ groups: [], session: { startedAt: 'nope' }, sessions: [null, {}] })).toMatchObject({ session: null, sessions: [] });
  });
});
