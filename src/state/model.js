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
