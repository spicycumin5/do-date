import './styles/tokens.css';
import './styles/base.css';
import './styles/tank.css';
import './styles/list.css';
import './styles/settings.css';

import { state, subscribe } from './state/store.js';
import { initToast, toast } from './ui/toast.js';
import { initAccount, renderAccount } from './ui/account.js';
import { cloudEnabled } from './sync/config.js';
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

// Accounts are optional: load Firebase only when it's configured, after the first paint.
if (cloudEnabled) {
  import('./sync/cloud.js').then(({ initCloud }) => {
    const cloud = initCloud({ onStatus: renderAccount, onMessage: msg => toast(msg) });
    initAccount(cloud);
  });
}
