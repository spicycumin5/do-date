import './styles/tokens.css';
import './styles/base.css';
import './styles/tank.css';
import './styles/list.css';
import './styles/settings.css';

import { state, subscribe } from './state/store.js';
import { initToast } from './ui/toast.js';
import { initSettings, renderSettings } from './ui/settings.js';
import { initList, renderList, revealTask } from './ui/list.js';
import { initTank, renderTank, highlightTask } from './ui/tank.js';
import { renderStats } from './ui/stats.js';

initToast();
initSettings();
initList({ onHoverTask: highlightTask });
initTank({ onSelectTask: revealTask });

subscribe(({ list, settings, focusQuick, float }) => {
  if (list) renderList(state, focusQuick);
  if (settings) renderSettings(state);
  renderStats(state);
  renderTank(state, float);
});

renderSettings(state);
renderList(state);
renderStats(state);
renderTank(state);
