// Pure data model: shapes, defaults, validation and derived totals. No DOM, no storage.

export const PALETTE = ['#e8845c', '#e9b949', '#7fb77e', '#5fa8b8', '#8a8fe0', '#c97bb5', '#d9615f', '#a3a35a'];

export const DEFAULT_TEMPLATE = [
  { name: 'Write lyrics', minutes: 60 },
  { name: 'Demo', minutes: 60 },
  { name: 'Record instruments', minutes: 90 },
  { name: 'Record vocals', minutes: 30 },
  { name: 'Mix', minutes: 60 },
  { name: 'Master', minutes: 30 },
];

const LOG_LIMIT = 2000;
const SESSION_LIMIT = 200;
const WEEK_MS = 7 * 864e5;

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

export function createTask(name, minutes, done = false) {
  const now = Date.now();
  return { id: uid(), name, minutes, done, doneAt: done ? now : null, createdAt: now };
}

export function createGroup(state, name, tasks = []) {
  return { id: uid(), name, color: nextColor(state), collapsed: false, tasks };
}

export function emptyState() {
  return {
    version: 1,
    sample: false,
    project: { name: 'My album', hoursPerDay: 2, workDays: [1, 2, 3, 4, 5, 6], bufferPct: 0 },
    groups: [],
    template: DEFAULT_TEMPLATE.map(t => ({ ...t })),
    log: [],
    session: null, // the work session in progress, if any
    sessions: [], // finished sessions, oldest first
  };
}

export function sampleState() {
  const s = emptyState();
  s.sample = true;
  s.project.bufferPct = 20;
  const group = (name, color, tasks) => ({ id: uid(), name, color, collapsed: false, tasks });
  s.groups = [
    group('Opener', PALETTE[0], [
      createTask('Write lyrics', 60, true), createTask('Demo', 90, true), createTask('Record guitars', 60),
      createTask('Record vocals', 30), createTask('Mix instruments', 60), createTask('Master', 30),
    ]),
    group('Slow one', PALETTE[3], [
      createTask('Finish second verse', 45, true), createTask('Record bass', 45), createTask('Record vocals', 30),
      createTask('Harmonies', 45), createTask('Mix', 90),
    ]),
    group('Untitled 3', PALETTE[1], [
      createTask('Write chorus', 60), createTask('Arrange', 90), createTask('Record everything', 180),
    ]),
    group('Album extras', PALETTE[5], [
      createTask('Cover art', 120), createTask('Sequencing', 30), createTask('Upload to distributor', 45),
    ]),
  ];
  return s;
}

/** Coerces untrusted data (storage, imported files) into a valid state, or null if it isn't one. */
export function normalize(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.groups)) return null;
  const s = emptyState();
  const p = raw.project || {};
  s.sample = !!raw.sample;
  s.project.name = typeof p.name === 'string' ? p.name : s.project.name;
  s.project.hoursPerDay = Number.isFinite(+p.hoursPerDay) ? Math.min(24, Math.max(0, +p.hoursPerDay)) : 2;
  s.project.workDays = Array.isArray(p.workDays) ? p.workDays.filter(d => Number.isInteger(d) && d >= 0 && d <= 6) : s.project.workDays;
  s.project.bufferPct = Number.isFinite(+p.bufferPct) ? Math.min(100, Math.max(0, +p.bufferPct)) : 0;
  s.groups = raw.groups.map((g, i) => ({
    id: g.id || uid(),
    name: String(g.name ?? 'Untitled'),
    color: typeof g.color === 'string' ? g.color : PALETTE[i % PALETTE.length],
    collapsed: !!g.collapsed,
    tasks: (Array.isArray(g.tasks) ? g.tasks : []).map(t => ({
      id: t.id || uid(),
      name: String(t.name ?? ''),
      minutes: Math.max(1, Math.round(+t.minutes) || 30),
      done: !!t.done,
      doneAt: t.doneAt || null,
      createdAt: t.createdAt || Date.now(),
    })),
  }));
  if (Array.isArray(raw.template)) {
    s.template = raw.template
      .filter(t => t && t.name)
      .map(t => ({ name: String(t.name), minutes: Math.max(1, Math.round(+t.minutes) || 30) }));
  }
  s.log = Array.isArray(raw.log) ? raw.log.filter(e => e && Number.isFinite(e.t) && Number.isFinite(e.d)) : [];
  s.session = normalizeSession(raw.session, s.groups);
  s.sessions = Array.isArray(raw.sessions) ? raw.sessions.map(normalizeEntry).filter(Boolean).slice(-SESSION_LIMIT) : [];
  return s;
}

export function nextColor(state) {
  const used = new Set(state.groups.map(g => g.color));
  return PALETTE.find(c => !used.has(c)) || PALETTE[state.groups.length % PALETTE.length];
}

export function appendLog(state, kind, d, t = Date.now()) {
  state.log.push({ t, kind, d });
  if (state.log.length > LOG_LIMIT) state.log.splice(0, state.log.length - LOG_LIMIT);
}

/**
 * The tank is everything committed: total * (1 + buffer). Liquid is what's left: remaining + buffer.
 * The buffer shrinks in proportion as tasks get done.
 */
export function totals(state) {
  let total = 0, remaining = 0;
  for (const g of state.groups) for (const t of g.tasks) {
    total += t.minutes;
    if (!t.done) remaining += t.minutes;
  }
  const p = state.project.bufferPct / 100;
  return { total, remaining, done: total - remaining, buffer: remaining * p, capacity: total * (1 + p), p };
}

export function groupTotals(g) {
  let total = 0, remaining = 0, doneCount = 0;
  for (const t of g.tasks) {
    total += t.minutes;
    if (t.done) doneCount++;
    else remaining += t.minutes;
  }
  return { total, remaining, doneCount };
}

/** Minutes added (new tasks, longer estimates, un-checked tasks) vs. finished over the last week. */
export function weeklyScope(log, now = Date.now()) {
  const since = now - WEEK_MS;
  let added = 0, finished = 0;
  for (const e of log) {
    if (e.t < since) continue;
    if (e.kind === 'add' || e.kind === 'edit' || e.kind === 'undo') added += e.d;
    else if (e.kind === 'done') finished += e.d;
  }
  return { added, finished };
}

/* ---------- work sessions ---------- */

const minutesOr = (v, fallback) => Math.max(1, Math.round(+v) || fallback);
const taskSnap = t => ({ id: String(t.id ?? ''), name: String(t.name ?? ''), minutes: minutesOr(t.minutes, 30) });

function normalizeSession(raw, groups) {
  if (!raw || typeof raw !== 'object' || !Number.isFinite(raw.startedAt) || !Array.isArray(raw.taskIds)) return null;
  const ids = new Set(groups.flatMap(g => g.tasks.map(t => t.id)));
  return {
    id: String(raw.id || uid()),
    startedAt: raw.startedAt,
    plannedMinutes: minutesOr(raw.plannedMinutes, 60),
    intent: String(raw.intent ?? ''),
    taskIds: raw.taskIds.filter(id => ids.has(id)),
  };
}

function normalizeEntry(e) {
  if (!e || typeof e !== 'object' || !Number.isFinite(e.startedAt) || !Number.isFinite(e.endedAt)) return null;
  return {
    id: String(e.id || uid()),
    startedAt: e.startedAt,
    endedAt: e.endedAt,
    plannedMinutes: minutesOr(e.plannedMinutes, 60),
    intent: String(e.intent ?? ''),
    note: String(e.note ?? ''),
    planned: (Array.isArray(e.planned) ? e.planned : []).filter(Boolean).map(t => ({ ...taskSnap(t), done: !!t.done })),
    extra: (Array.isArray(e.extra) ? e.extra : []).filter(Boolean).map(taskSnap),
  };
}

/** Open tasks in list order, taking each while it fits in `minutes` (always at least one, if any are open). */
export function suggestTasks(state, minutes) {
  const ids = [];
  let sum = 0;
  for (const g of state.groups) for (const t of g.tasks) {
    if (t.done) continue;
    if (ids.length && sum + t.minutes > minutes) return ids;
    ids.push(t.id);
    sum += t.minutes;
  }
  return ids;
}

export function startSession(state, { taskIds, plannedMinutes, intent = '' }, now = Date.now()) {
  state.session = { id: uid(), startedAt: now, plannedMinutes: minutesOr(plannedMinutes, 60), intent: intent.trim(), taskIds: [...taskIds] };
  return state.session;
}

/**
 * Where the current session stands: its planned tasks (in list order), how many are done,
 * and `extra` tasks that weren't planned but were finished since it started.
 */
export function sessionProgress(state, now = Date.now()) {
  const s = state.session;
  if (!s) return null;
  const ids = new Set(s.taskIds);
  const tasks = [], extra = [];
  let plannedTotal = 0, doneMinutes = 0, done = 0;
  for (const g of state.groups) for (const t of g.tasks) {
    if (ids.has(t.id)) {
      tasks.push(t);
      plannedTotal += t.minutes;
      if (t.done) { done++; doneMinutes += t.minutes; }
    } else if (t.done && t.doneAt >= s.startedAt) {
      extra.push(t);
    }
  }
  const elapsed = Math.max(0, Math.floor((now - s.startedAt) / 60000));
  return { tasks, extra, planned: tasks.length, done, plannedTotal, doneMinutes, elapsed, left: s.plannedMinutes - elapsed };
}

/** Files the current session into history with an optional note, and clears it. */
export function endSession(state, note = '', now = Date.now()) {
  const p = sessionProgress(state, now);
  if (!p) return null;
  const s = state.session;
  const entry = {
    id: s.id, startedAt: s.startedAt, endedAt: now, plannedMinutes: s.plannedMinutes, intent: s.intent, note: note.trim(),
    planned: p.tasks.map(t => ({ ...taskSnap(t), done: t.done })),
    extra: p.extra.map(taskSnap),
  };
  state.sessions.push(entry);
  if (state.sessions.length > SESSION_LIMIT) state.sessions.splice(0, state.sessions.length - SESSION_LIMIT);
  state.session = null;
  return entry;
}
