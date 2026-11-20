import './styles/tokens.css';
import './styles/base.css';
import './styles/tank.css';
import './styles/list.css';
import './styles/settings.css';
import './styles/session.css';
import './styles/projects.css';
import './styles/overview.css';

import { state, subscribe } from './state/store.js';
import { initToast, toast } from './ui/toast.js';
import { initAccount, renderAccount } from './ui/account.js';
import { cloudEnabled } from './sync/config.js';
import { initSettings, renderSettings } from './ui/settings.js';
import { initList, renderList, revealTask } from './ui/list.js';
import { initTank, renderTank, highlightTask } from './ui/tank.js';
import { renderStats } from './ui/stats.js';
import { initSession, renderSession } from './ui/session.js';
import { initProjects, renderProjects, openSheet as openNewProject } from './ui/projects.js';
import { initOverview } from './ui/overview.js';

initToast();
initSettings();
initList({ onHoverTask: highlightTask });
initTank({ onSelectTask: revealTask });
initSession();
initProjects();
initOverview({ onNewProject: openNewProject });

subscribe(({ list, settings, focusQuick, float }) => {
  if (list) renderList(state, focusQuick);
  if (settings) renderSettings(state);
  renderStats(state);
  renderSession(state);
  renderProjects();
  renderTank(state, float);
});

renderSettings(state);
renderList(state);
renderStats(state);
renderSession(state);
renderProjects();
renderTank(state);

// Accounts are optional: load Firebase only when it's configured, after the first paint.
if (cloudEnabled) {
  import('./sync/cloud.js').then(({ initCloud }) => {
    const cloud = initCloud({ onStatus: renderAccount, onMessage: msg => toast(msg) });
    initAccount(cloud);
  });
}
