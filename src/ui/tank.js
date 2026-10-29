// The SVG tank: stacked task slices that animate between layouts, plus ticks, tooltips and +/- floats.

import { $, $$, esc, svgEl, truncate, reduceMotion } from './dom.js';
import { fmt } from '../lib/duration.js';
import { totals } from '../state/model.js';
import { findTask } from '../state/store.js';

// Inner geometry of the tank, in viewBox units (must match the markup in index.html).
const G = { x: 40, w: 240, top: 20, bottom: 490 };
G.h = G.bottom - G.top;

const POUR_MS = 1100;
const MOVE_MS = 650;

const live = new Map(); // key -> { kind, el, cur, from, to, data, remove }
let animStart = 0, animDur = 0, raf = 0, firstPaint = true;

function wavePath(closed) {
  const x0 = G.x - 120, x1 = G.x + G.w + 120;
  let d = `M${x0},0`;
  for (let x = x0; x < x1; x += 60) d += ' q15,-5 30,0 q15,5 30,0';
  return closed ? d + ` V9 H${x0} Z` : d;
}

/** Target layout, top to bottom: done (ghost), buffer, then each song's open tasks in list order. */
function layout(state) {
  const T = totals(state);
  const items = [];
  if (T.capacity <= 0) return { T, items, liquidTop: G.bottom, sc: 0 };
  const sc = G.h / T.capacity;
  const liquidTop = G.bottom - (T.remaining + T.buffer) * sc;
  let y = liquidTop;

  items.push({ key: '__ghost', kind: 'ghost', y: G.top, h: liquidTop - G.top, text: T.done > 0 ? `${fmt(T.done * (1 + T.p))} done` : '' });
  if (T.buffer > 0) {
    const h = T.buffer * sc;
    items.push({ key: '__buffer', kind: 'buffer', y, h, text: `buffer ${fmt(T.buffer)}` });
    y += h;
  }
  for (const g of state.groups) {
    const start = y;
    let i = 0, rem = 0;
    for (const t of g.tasks) {
      if (t.done) continue;
      const h = t.minutes * sc;
      items.push({ key: t.id, kind: 'task', y, h, color: g.color, alt: i++ % 2 === 1, tid: t.id });
      y += h;
      rem += t.minutes;
    }
    if (y > start) items.push({ key: 'L' + g.id, kind: 'label', y: start, h: y - start, text: `${truncate(g.name || 'Untitled', 22)} · ${fmt(rem)}` });
  }
  if (T.remaining + T.buffer > 0) items.push({ key: '__wave', kind: 'wave', y: liquidTop, h: 0 });
  return { T, items, liquidTop, sc };
}

function createEl(it) {
  let el;
  if (it.kind === 'task') {
    el = svgEl('rect', { class: 'seg', x: G.x, width: G.w, 'data-tid': it.tid });
    $('#segLayer').appendChild(el);
  } else if (it.kind === 'buffer' || it.kind === 'ghost') {
    el = svgEl('g');
    el.appendChild(svgEl('rect', { class: it.kind === 'buffer' ? 'seg-buffer' : 'ghost', x: G.x, width: G.w }));
    el.appendChild(svgEl('text', { class: it.kind + '-label', x: G.x + G.w / 2, 'text-anchor': 'middle', 'dominant-baseline': 'middle' }));
    $(it.kind === 'buffer' ? '#segLayer' : '#ghostLayer').appendChild(el);
  } else if (it.kind === 'label') {
    el = svgEl('text', { class: 'seg-label', x: G.x + 14, 'dominant-baseline': 'middle' });
    $('#labelLayer').appendChild(el);
  } else if (it.kind === 'wave') {
    el = svgEl('g');
    const inner = svgEl('g', { class: 'wave-inner' });
    inner.appendChild(svgEl('path', { class: 'wave-fill', d: wavePath(true) }));
    inner.appendChild(svgEl('path', { class: 'wave-line', d: wavePath(false) }));
    el.appendChild(inner);
    $('#waveLayer').appendChild(el);
  }
  return el;
}

function draw(it) {
  const { y } = it.cur, h = Math.max(0, it.cur.h);
  const el = it.el;
  if (it.kind === 'task') {
    el.setAttribute('y', y);
    el.setAttribute('height', h);
    el.setAttribute('fill', it.data.color);
    el.setAttribute('fill-opacity', it.data.alt ? 0.84 : 1);
  } else if (it.kind === 'buffer' || it.kind === 'ghost') {
    const r = el.firstChild, t = el.lastChild;
    r.setAttribute('y', y);
    r.setAttribute('height', h);
    t.setAttribute('y', y + h / 2);
    t.textContent = it.data.text;
    t.style.opacity = h >= (it.kind === 'ghost' ? 30 : 18) && !it.remove ? 1 : 0;
  } else if (it.kind === 'label') {
    el.setAttribute('y', y + h / 2);
    el.textContent = it.data.text;
    el.style.opacity = h >= 19 && !it.remove ? 1 : 0;
  } else if (it.kind === 'wave') {
    el.setAttribute('transform', `translate(0 ${y})`);
    el.style.opacity = it.remove ? 0 : 1;
  }
}

const ease = k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

function frame(now) {
  const k = animDur ? Math.min(1, (now - animStart) / animDur) : 1;
  const e = ease(k);
  for (const it of live.values()) {
    it.cur = { y: it.from.y + (it.to.y - it.from.y) * e, h: it.from.h + (it.to.h - it.from.h) * e };
    draw(it);
  }
  if (k < 1) {
    raf = requestAnimationFrame(frame);
    return;
  }
  raf = 0;
  for (const [key, it] of live) if (it.remove) { it.el.remove(); live.delete(key); }
}

/** Animates from the current picture to the layout for `state`. `float` is an optional { text, cls } marker. */
export function renderTank(state, float) {
  const L = layout(state);
  const seen = new Set();
  const pour = firstPaint;
  firstPaint = false;

  for (const t of L.items) {
    seen.add(t.key);
    let it = live.get(t.key);
    if (!it) {
      let from;
      if (pour) from = t.kind === 'ghost' ? { y: G.top, h: G.h } : { y: G.bottom, h: 0 };
      else if (t.kind === 'ghost' || t.kind === 'wave') from = { y: t.y, h: t.h };
      else from = { y: t.y, h: 0 };
      it = { kind: t.kind, el: createEl(t), cur: from };
      live.set(t.key, it);
    }
    it.from = { ...it.cur };
    it.to = { y: t.y, h: t.h };
    it.data = t;
    it.remove = false;
  }
  for (const [key, it] of live) {
    if (seen.has(key)) continue;
    it.from = { ...it.cur };
    it.to = it.kind === 'wave' ? { ...it.cur } : { y: it.cur.y + it.cur.h / 2, h: 0 };
    it.remove = true;
  }

  renderTicks(L);
  renderMessage(L.T);

  animStart = performance.now();
  animDur = reduceMotion.matches ? 0 : pour ? POUR_MS : MOVE_MS;
  if (!raf) raf = requestAnimationFrame(frame);

  if (float) showFloat(float, L.liquidTop);
}

function renderTicks(L) {
  const g = $('#ticks');
  g.textContent = '';
  if (!L.sc) return;
  const capH = L.T.capacity / 60;
  const step = [0.5, 1, 2, 3, 5, 10, 20, 25, 50, 100, 200, 500].find(s => capH / s <= 9) || 1000;
  for (let v = step; v <= capH + 1e-6; v += step) {
    const y = G.bottom - v * 60 * L.sc;
    const tick = svgEl('g', { class: 'tick' });
    tick.appendChild(svgEl('line', { x1: G.x - 8, x2: G.x - 2, y1: y, y2: y }));
    const text = svgEl('text', { x: G.x - 11, y, 'text-anchor': 'end', 'dominant-baseline': 'middle' });
    text.textContent = (Number.isInteger(v) ? v : v.toFixed(1)) + 'h';
    tick.appendChild(text);
    g.appendChild(tick);
  }
}

function renderMessage(T) {
  const msg = $('#tankMsg');
  if (T.total === 0) msg.innerHTML = '<tspan class="big" x="160" dy="0">Empty tank</tspan><tspan x="160" dy="26">Add a song and some tasks</tspan><tspan x="160" dy="20">to fill it with work.</tspan>';
  else if (T.remaining === 0) msg.innerHTML = '<tspan class="big" x="160" dy="0">Drained.</tspan><tspan x="160" dy="26">Every task is done.</tspan>';
  else msg.textContent = '';
}

function svgToWrap(x, y) {
  const svg = $('#tank');
  const ctm = svg.getScreenCTM?.();
  if (!ctm) return null;
  const p = new DOMPoint(x, y).matrixTransform(ctm);
  const r = $('#tankWrap').getBoundingClientRect();
  return { x: p.x - r.left, y: p.y - r.top };
}

function showFloat(f, liquidTop) {
  const p = svgToWrap(G.x + G.w / 2, Math.max(G.top + 10, liquidTop));
  if (!p) return;
  const el = document.createElement('div');
  el.className = 'float ' + f.cls;
  el.textContent = f.text;
  el.style.left = p.x + 'px';
  el.style.top = p.y + 'px';
  el.addEventListener('animationend', () => el.remove());
  $('#tankWrap').appendChild(el);
  if (reduceMotion.matches) setTimeout(() => el.remove(), 1200);
}

export function highlightTask(tid) {
  $$('.seg.hl').forEach(r => r.classList.remove('hl'));
  if (tid) $(`.seg[data-tid="${tid}"]`)?.classList.add('hl');
}

/** `onSelectTask(tid)` runs when a slice is clicked. */
export function initTank({ onSelectTask }) {
  const layer = $('#segLayer');
  const tip = $('#tooltip');
  const hideTip = () => tip.classList.remove('show');

  layer.addEventListener('pointermove', e => {
    const rect = e.target.closest('rect[data-tid]');
    const f = rect && findTask(rect.dataset.tid);
    if (!f) return hideTip();
    const wr = $('#tankWrap').getBoundingClientRect();
    tip.innerHTML = `${esc(f.t.name || 'Untitled task')} · <b>${fmt(f.t.minutes)}</b><small>${esc(f.g.name)}</small>`;
    tip.style.left = (e.clientX - wr.left) + 'px';
    tip.style.top = (e.clientY - wr.top) + 'px';
    tip.classList.add('show');
  });
  layer.addEventListener('pointerleave', hideTip);
  window.addEventListener('resize', hideTip);

  layer.addEventListener('click', e => {
    const rect = e.target.closest('rect[data-tid]');
    if (rect) onSelectTask(rect.dataset.tid);
  });
}
