// Auto / light / dark. The saved choice is applied before first paint by the inline script in index.html.

import { $, $$ } from './dom.js';

export const THEME_KEY = 'dodate.theme';

function applyTheme(t) {
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  $$('[data-theme-set]').forEach(b => b.classList.toggle('on', b.dataset.themeSet === t));
}

export function initTheme() {
  let theme = 'auto';
  try { theme = localStorage.getItem(THEME_KEY) || 'auto'; } catch (e) { /* storage unavailable */ }
  applyTheme(theme);

  $('#themeRow').addEventListener('click', e => {
    const b = e.target.closest('[data-theme-set]');
    if (!b) return;
    applyTheme(b.dataset.themeSet);
    try { localStorage.setItem(THEME_KEY, b.dataset.themeSet); } catch (e) { /* storage unavailable */ }
  });
}
