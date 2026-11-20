import { describe, it, expect } from 'vitest';
import {
  PALETTE, emptyProject, sampleProject, normalizeProject, normalizeWorkspace, emptyWorkspace, sampleWorkspace,
  activeProject, plural, unitWords, KINDS, weekLoad, workspaceTotals, totals, groupTotals, nextColor, appendLog, weeklyScope, createTask,
  suggestTasks, startSession, sessionProgress, endSession,
} from '../src/state/model.js';

function stateWith(tasks, bufferPct = 0) {
  const s = emptyProject();
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
    expect(totals(emptyProject())).toMatchObject({ total: 0, remaining: 0, capacity: 0 });
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
    expect(normalizeProject(null)).toBeNull();
    expect(normalizeProject({ foo: 1 })).toBeNull();
  });

  it('round-trips the sample', () => {
    const s = sampleProject();
    expect(normalizeProject(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('repairs bad values', () => {
    const s = normalizeProject({
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
    const s = emptyProject();
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
    const n = normalizeProject(JSON.parse(JSON.stringify(s)));
    expect(n.session).toMatchObject({ startedAt: T0, plannedMinutes: 60, intent: 'x', taskIds: [a.id] });
    expect(n.sessions).toHaveLength(1);
    expect(n.sessions[0]).toMatchObject({ note: '', intent: '', extra: [] });
    expect(normalizeProject({ groups: [], session: { startedAt: 'nope' }, sessions: [null, {}] })).toMatchObject({ session: null, sessions: [] });
  });
});

describe('projects', () => {
  it('starts each kind with its own words and template', () => {
    const art = emptyProject('art');
    expect(art.project).toMatchObject({ kind: 'art', unit: 'piece', name: KINDS.art.name });
    expect(art.template.map(t => t.name)).toContain('Line art');
    expect(unitWords(art)).toEqual({ one: 'piece', many: 'pieces', One: 'Piece', Many: 'Pieces' });
    expect(emptyProject('nonsense').project.kind).toBe('other');
    expect(emptyProject('writing', 'Novel').project.name).toBe('Novel');
  });

  it('pluralizes the unit', () => {
    expect(['song', 'story', 'sketch', 'day', 'canvas'].map(plural)).toEqual(['songs', 'stories', 'sketches', 'days', 'canvases']);
  });

  it('upgrades a version-1 save into a one-project workspace', () => {
    const v1 = JSON.parse(JSON.stringify(sampleProject()));
    delete v1.id;
    delete v1.project.kind;
    delete v1.project.unit;
    const w = normalizeWorkspace(v1);
    expect(w.projects).toHaveLength(1);
    expect(w.activeId).toBe(w.projects[0].id);
    expect(w.projects[0].project).toMatchObject({ kind: 'music', unit: 'song', name: 'My album' });
    expect(w.projects[0].groups).toHaveLength(4);
  });

  it('round-trips a workspace and repairs its pointers', () => {
    const w = sampleWorkspace();
    w.projects.push(emptyProject('art'));
    w.activeId = w.projects[1].id;
    const n = normalizeWorkspace(JSON.parse(JSON.stringify(w)));
    expect(n).toEqual(w);
    expect(activeProject(n).project.kind).toBe('art');

    n.activeId = 'missing';
    n.projects[1].id = n.projects[0].id;
    const fixed = normalizeWorkspace(JSON.parse(JSON.stringify(n)));
    expect(fixed.activeId).toBe(fixed.projects[0].id);
    expect(new Set(fixed.projects.map(p => p.id)).size).toBe(2);
  });

  it('rejects workspaces with no valid project', () => {
    expect(normalizeWorkspace({ projects: [] })).toBeNull();
    expect(normalizeWorkspace({ projects: [{ nope: 1 }] })).toBeNull();
    expect(normalizeWorkspace(emptyWorkspace()).projects).toHaveLength(1);
  });
});

describe('all projects', () => {
  it('sums what is left and the hours promised per weekday, skipping finished projects', () => {
    const a = emptyProject('music');
    a.project = { ...a.project, hoursPerDay: 2, workDays: [1, 2], bufferPct: 50 };
    a.groups = [{ id: 'g', name: 's', color: PALETTE[0], collapsed: false, tasks: [createTask('x', 60), createTask('y', 30, true)] }];
    const b = emptyProject('art');
    b.project = { ...b.project, hoursPerDay: 1.5, workDays: [2, 3] };
    b.groups = [{ id: 'h', name: 'p', color: PALETTE[1], collapsed: false, tasks: [createTask('z', 120)] }];
    const done = emptyProject('writing');
    done.groups = [{ id: 'i', name: 'c', color: PALETTE[2], collapsed: false, tasks: [createTask('w', 45, true)] }];
    const w = { version: 2, activeId: a.id, projects: [a, b, done] };
    expect(weekLoad(w)).toEqual([0, 2, 3.5, 1.5, 0, 0, 0]);
    expect(workspaceTotals(w)).toEqual({ left: 90 + 120, total: 90 + 120 + 45, done: 30 + 45, active: 2 });
  });
});
