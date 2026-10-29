// The single source of truth. UI modules mutate `state`, then call commit() so subscribers re-render.

import { normalize, sampleState, appendLog } from './model.js';

const KEY = 'dodate.v1';
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = normalize(JSON.parse(raw));
      if (s) return s;
    }
  } catch (e) { /* unreadable storage: fall back to the sample */ }
  return sampleState();
}

export let state = load();

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
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

export function replaceState(next) {
  state = next;
}

export const snapshot = () => JSON.stringify(state);

export function restore(snap) {
  const s = normalize(JSON.parse(snap));
  if (s) state = s;
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
