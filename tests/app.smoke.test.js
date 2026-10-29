// @vitest-environment jsdom
// Boots the real page in jsdom and drives a few core interactions end to end.

import { describe, it, expect, beforeAll, vi } from 'vitest';

// Run local-only: no Firebase in tests.
vi.mock('../src/sync/config.js', () => ({ firebaseConfig: {}, cloudEnabled: false }));
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const flush = () => new Promise(r => setTimeout(r, 5));
const key = (el, k) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

beforeAll(async () => {
  const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
  document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)[1];
  window.matchMedia = () => ({ matches: true, addEventListener() {} }); // reduced motion: no animation
  window.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 0);
  Element.prototype.scrollIntoView = () => {};
  localStorage.clear();
  await import('../src/main.js');
  await flush();
});

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

describe('app', () => {
  it('starts with the sample album', () => {
    expect($$('.group')).toHaveLength(4);
    expect($('#sampleBanner').hidden).toBe(false);
    expect($('#statFinish').textContent).toMatch(/done/);
    expect($$('#segLayer rect[data-tid]').length).toBe(14);
  });

  it('quick-adds a task and grows the tank', async () => {
    const before = $('#statLeft').textContent;
    const quick = $('.group .quick');
    quick.value = 'record harmonies 45m';
    key(quick, 'Enter');
    await flush();
    const names = $$('.group')[0].querySelectorAll('.t-name');
    expect([...names].map(n => n.value)).toContain('record harmonies');
    expect($('#statLeft').textContent).not.toBe(before);
    expect(document.activeElement.classList.contains('quick')).toBe(true);
  });

  it('checking a task off drains it from the tank', async () => {
    const box = $('.task:not(.done) input[type=checkbox]');
    const tid = box.closest('.task').dataset.tid;
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect($(`.task[data-tid="${tid}"]`).classList.contains('done')).toBe(true);
    expect($(`#segLayer rect[data-tid="${tid}"]`)).toBeNull();
  });

  it('persists to localStorage', () => {
    const saved = JSON.parse(localStorage.getItem('dodate.v1'));
    expect(saved.groups[0].tasks.some(t => t.name === 'record harmonies')).toBe(true);
  });

  it('start fresh empties everything and undo brings it back', async () => {
    $('#sampleBanner [data-act="fresh"]').click();
    await flush();
    expect($$('.group')).toHaveLength(0);
    expect($('#tankMsg').textContent).toMatch(/Empty tank/);
    $('#toastUndo').click();
    await flush();
    expect($$('.group')).toHaveLength(4);
  });

  it('rejects an invalid time edit', async () => {
    const dur = $('.task .t-dur');
    const original = dur.value;
    dur.value = 'soon';
    dur.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(dur.value).toBe(original);
  });
});
