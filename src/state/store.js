// The single source of truth. `workspace` holds every project; `state` is the active one.
// UI modules mutate `state` (or `workspace`), then call commit() so subscribers re-render.

import { normalizeWorkspace, sampleWorkspace, activeProject, emptyProject, appendLog } from './model.js';

const KEY = 'dodate.v1';
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const w = normalizeWorkspace(JSON.parse(raw));
      if (w) return w;
    }
  } catch (e) { /* unreadable storage: fall back to the sample */ }
  return sampleWorkspace();
}

export let workspace = load();
export let state = activeProject(workspace);

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(workspace)); } catch (e) { /* storage unavailable */ }
}

/** Fires on every commit with its options: { list, settings, float, focusQuick }. */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function commit(opts = {}) {
  save();
  for (const fn of listeners) fn(opts);
}

export function replaceWorkspace(next) {
  workspace = next;
  state = activeProject(next);
}

export function switchProject(id) {
  if (!workspace.projects.some(p => p.id === id)) return;
  workspace.activeId = id;
  state = activeProject(workspace);
}

/** Adds a new project of `kind` and makes it the active one. */
export function addProject(kind, name) {
  const p = emptyProject(kind, name);
  workspace.projects.push(p);
  switchProject(p.id);
  return p;
}

/** Removes a project. The last one can't be removed; it would leave nothing to show. */
export function removeProject(id) {
  const i = workspace.projects.findIndex(p => p.id === id);
  if (i < 0 || workspace.projects.length < 2) return false;
  workspace.projects.splice(i, 1);
  if (workspace.activeId === id) workspace.activeId = workspace.projects[Math.max(0, i - 1)].id;
  state = activeProject(workspace);
  return true;
}

export const snapshot = () => JSON.stringify(workspace);

export function restore(snap) {
  const w = normalizeWorkspace(JSON.parse(snap));
  if (w) replaceWorkspace(w);
}

export const logEvent = (kind, d) => appendLog(state, kind, d);

export function findTask(tid) {
  for (const g of state.groups) {
    const i = g.tasks.findIndex(t => t.id === tid);
    if (i >= 0) return { g, t: g.tasks[i], i };
  }
  return null;
}

export const findGroup = gid => state.groups.find(g => g.id === gid);
