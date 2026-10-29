// Bottom toast with an optional Undo that restores a state snapshot.

import { $ } from './dom.js';
import { commit, restore } from '../state/store.js';

let undoSnap = null, timer = 0;

export function toast(msg, snap = null) {
  undoSnap = snap;
  $('#toastMsg').textContent = msg;
  $('#toastUndo').hidden = !snap;
  $('#toast').classList.add('show');
  clearTimeout(timer);
  timer = setTimeout(() => $('#toast').classList.remove('show'), snap ? 7000 : 3200);
}

export function initToast() {
  $('#toastUndo').addEventListener('click', () => {
    if (!undoSnap) return;
    restore(undoSnap);
    undoSnap = null;
    $('#toast').classList.remove('show');
    commit({ list: true, settings: true });
  });
}
