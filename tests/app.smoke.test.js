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
    const saved = JSON.parse(localStorage.getItem('dodate.v1')).projects[0];
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

  it('plans a work session, tracks it, and reviews it', async () => {
    $('[data-ses="plan"]').click();
    expect($('#sessionSheet').hidden).toBe(false);
    const picked = $$('.pick input:checked');
    expect(picked.length).toBeGreaterThan(0);
    const n = picked.length;
    expect($('#sesFit').textContent).toMatch(/picked/);

    $('#sesIntent').value = 'Get the opener tracked';
    $('[data-ses="start"]').click();
    await flush();
    expect($('#sessionSheet').hidden).toBe(true);
    expect($('#sessionBar').textContent).toMatch('Get the opener tracked');
    expect($('#sessionBar').textContent).toMatch(`0 of ${n}`);
    expect($$('#segLayer .seg.planned')).toHaveLength(n);
    expect($$('.task.planned')).toHaveLength(n);

    const box = $('.task.planned:not(.done) input[type=checkbox]');
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect($('#sessionBar').textContent).toMatch(`1 of ${n}`);

    $('[data-ses="end"]').click();
    expect($$('.review-list li')).toHaveLength(n);
    expect($$('.review-list li.done')).toHaveLength(1);
    $('#sesNote').value = 'Vocals next';
    $('[data-ses="save"]').click();
    await flush();
    expect($('[data-ses="plan"]')).not.toBeNull();
    expect($$('.task.planned')).toHaveLength(0);
    expect($('#historySection').hidden).toBe(false);
    const saved = JSON.parse(localStorage.getItem('dodate.v1')).projects[0];
    expect(saved.session).toBeNull();
    expect(saved.sessions).toHaveLength(1);
    expect(saved.sessions[0]).toMatchObject({ intent: 'Get the opener tracked', note: 'Vocals next' });
  });

  it('puts the session button above the tank, where it is always in view', () => {
    const bar = $('#sessionBar'), tank = $('#tankWrap');
    expect(bar.compareDocumentPosition(tank) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('creates an art project, switches between projects, and keeps one session at a time', async () => {
    $('[data-ses="plan"]').click();
    $('[data-ses="start"]').click();
    await flush();
    const album = $('#projectName').value;

    $('#projectMenuBtn').click();
    expect($('#projectMenu').hidden).toBe(false);
    expect($$('.pm-item')).toHaveLength(1);
    $('[data-pm="new"]').click();
    expect($('#projectSheet').hidden).toBe(false);
    $('.kind[data-kind="art"]').click();
    $('#newProjName').value = 'Zine';
    $('[data-pm="create"]').click();
    await flush();

    expect($('#projectName').value).toBe('Zine');
    expect($$('.group')).toHaveLength(0);
    expect($('#addTemplateGroup').textContent).toMatch('Piece from template');
    expect($('#sessionBar').textContent).toMatch(`running in ${album}`);

    $('#addTemplateGroup').click();
    await flush();
    expect($('.group .g-name').value).toBe('Piece 1');
    expect($('.group .quick').placeholder).toMatch('line art');

    $('#unitName').value = 'Spread';
    $('#unitName').dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect($('#addGroup').textContent).toBe('+ Empty spread');

    $('[data-ses="goto"]').click();
    await flush();
    expect($('#projectName').value).toBe(album);
    expect($$('.group')).toHaveLength(4);
    expect($('#sessionBar [data-ses="end"]')).not.toBeNull();

    const saved = JSON.parse(localStorage.getItem('dodate.v1'));
    expect(saved.projects.map(p => p.project.name)).toEqual([album, 'Zine']);
    expect(saved.projects[1].project).toMatchObject({ kind: 'art', unit: 'spread' });

    // delete the album, then undo
    $('#deleteProject').click();
    await flush();
    expect($('#projectName').value).toBe('Zine');
    expect($('#deleteProject').disabled).toBe(true);
    $('#toastUndo').click();
    await flush();
    expect(JSON.parse(localStorage.getItem('dodate.v1')).projects).toHaveLength(2);
  });

  it('shows every project together and opens one from there', async () => {
    $('#projectMenuBtn').click();
    $('[data-pm="all"]').click();
    expect($('#overview').hidden).toBe(false);
    expect($('#workspace').hidden).toBe(true);
    const cards = $$('.ov-card[data-pid]');
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toMatch('Session running');
    expect(cards[1].textContent).toMatch('Zine');
    expect($('#ovSummary').textContent).toMatch('left across 2 projects');

    cards[1].click();
    await flush();
    expect($('#overview').hidden).toBe(true);
    expect($('#projectName').value).toBe('Zine');
  });
});
