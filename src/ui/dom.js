export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
export const scrollBehavior = () => (reduceMotion.matches ? 'auto' : 'smooth');

const SVG_NS = 'http://www.w3.org/2000/svg';
export function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

export const truncate = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
