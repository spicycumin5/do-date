// Project name, work pace (hours/day + work days), and the settings drawer.

import { $, $$ } from './dom.js';
import { toast } from './toast.js';
import { initTheme } from './theme.js';
import { fmt, parseQuick } from '../lib/duration.js';
import { normalize } from '../state/model.js';
import { state, commit, replaceState, snapshot } from '../state/store.js';

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const openDrawer = () => {
  document.body.classList.add('settings-open');
  setTimeout(() => $('#closeSettings').focus(), 50);
};
const closeDrawer = () => document.body.classList.remove('settings-open');

function setTitle(name) {
  document.title = (name ? name + ' · ' : '') + 'Do Date';
}

function renderDays(s) {
  $('#workDays').innerHTML = DAY_ORDER.map(d => {
    const on = s.project.workDays.includes(d);
    return `<button class="day${on ? ' on' : ''}" data-day="${d}" aria-pressed="${on}">${DAY_NAMES[d]}</button>`;
  }).join('');
}

function renderTemplate(s) {
  $('#templateText').value = s.template.map(t => `${t.name} ${fmt(t.minutes).replace(' ', '')}`).join('\n');
}

export function renderSettings(s) {
  $('#projectName').value = s.project.name;
  setTitle(s.project.name);
  $('#hoursPerDay').value = s.project.hoursPerDay;
  $('#bufferPct').value = s.project.bufferPct;
  $('#bufferOut').textContent = s.project.bufferPct + '%';
  renderDays(s);
  renderTemplate(s);
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `do-date-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importJSON(file) {
  try {
    const s = normalize(JSON.parse(await file.text()));
    if (!s) throw new Error('not a Do Date export');
    const snap = snapshot();
    replaceState(s);
    closeDrawer();
    commit({ list: true, settings: true });
    toast('Imported', snap);
  } catch (e) {
    toast("That file doesn't look like a Do Date export");
  }
}

export function initSettings() {
  initTheme();

  // project name
  const nameInput = $('#projectName');
  nameInput.addEventListener('input', () => {
    state.project.name = nameInput.value;
    setTitle(nameInput.value);
    commit();
  });
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') nameInput.blur(); });

  // pace
  const hpd = $('#hoursPerDay');
  hpd.addEventListener('input', () => {
    const v = parseFloat(hpd.value);
    state.project.hoursPerDay = Number.isFinite(v) ? Math.min(24, Math.max(0, v)) : 0;
    commit();
  });
  $('#workDays').addEventListener('click', e => {
    const b = e.target.closest('.day');
    if (!b) return;
    const d = +b.dataset.day;
    const days = state.project.workDays;
    state.project.workDays = days.includes(d) ? days.filter(x => x !== d) : [...days, d];
    renderDays(state);
    commit();
  });

  // drawer
  $('#settingsBtn').addEventListener('click', openDrawer);
  $('#closeSettings').addEventListener('click', closeDrawer);
  $('#scrim').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

  const buffer = $('#bufferPct');
  buffer.addEventListener('input', () => {
    state.project.bufferPct = +buffer.value;
    $('#bufferOut').textContent = buffer.value + '%';
    commit();
  });

  $('#templateText').addEventListener('change', e => {
    state.template = e.target.value.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const q = parseQuick(l);
      return { name: q.name, minutes: q.minutes };
    });
    renderTemplate(state);
    commit();
    toast('Template saved');
  });

  $('#exportBtn').addEventListener('click', exportJSON);
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) importJSON(file);
  });

  // "Start fresh" / "Keep it" appear both in the sample banner and in the drawer.
  $$('[data-act="fresh"]').forEach(b => b.addEventListener('click', () => {
    const snap = snapshot();
    state.groups = [];
    state.log = [];
    state.sample = false;
    closeDrawer();
    commit({ list: true, settings: true });
    toast('Cleared. Add your first song.', snap);
  }));
  $$('[data-act="keep"]').forEach(b => b.addEventListener('click', () => {
    state.sample = false;
    commit({ list: true });
  }));
}
