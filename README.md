# Do Date

See how much time your commitments really take. Every task adds its time to a tank; finishing tasks drains it. Keep as many projects as you like (an album, an art series, a book, anything else), each with its own tank, pace, template and work sessions. Set how many hours a day you can work and it projects a finish date that moves as the project grows or shrinks.

## Develop

```sh
npm install
npm run dev        # local dev server with hot reload
npm test           # unit + smoke tests (Vitest)
npm run build      # production build into dist/
npm run preview    # serve the built dist/ locally
```

## Project layout

```
index.html            page markup (the tank SVG skeleton lives here)
public/               static files copied as-is (favicon)
src/
  main.js             entry: wires modules together and re-renders on every commit
  lib/                pure helpers, no DOM
    duration.js       parse/format "30m", "1h30", "record vocals + 45 minutes"
    schedule.js       finish-date projection from hours/day and work days
  state/
    model.js          project kinds, data shape, defaults, sample album, validation, totals
    store.js          the workspace (all projects) + `state` (the active one), persistence, commit/subscribe
  ui/                 one module per area of the page
    tank.js           animated SVG tank, tooltips, +/- markers
    list.js           cards (songs, pieces, chapters…), tasks, quick-add, drag to reorder
    projects.js       project switcher, new-project sheet, delete project
    overview.js       "All projects": totals, hours per weekday across projects, a card per project
    stats.js          headline numbers, finish date, weekly scope line
    session.js        work sessions: plan what to clear, countdown, end-of-session review + history
    settings.js       project name, pace, settings drawer, import/export
    theme.js          auto/light/dark
    toast.js          notifications with undo
    dom.js            small DOM helpers
  sync/               optional Google sign-in + Firestore sync
  styles/             tokens.css (colors) + one stylesheet per area
tests/                Vitest; app.smoke.test.js boots the real page in jsdom
```

Saved data is a workspace: `{ version: 2, activeId, projects: [...] }`. Each project has the version-1 shape (`project`, `groups`, `template`, `log`, `session`, `sessions`) plus an `id`; `project.kind` (music / art / writing / other) picks starting defaults and `project.unit` is what one card is called. Version-1 saves and exports load as a one-project workspace. Only one work session runs at a time across projects.

Data flow: UI handlers mutate `state` (the active project) from `store.js`, then call `commit(opts)`. That saves to localStorage and notifies `main.js`, which re-renders stats and the tank (and the list/settings when `opts` asks for it).

## Data and accounts

Signed out, everything is stored in the browser's localStorage under `dodate.v1`.

Signing in with Google syncs the whole workspace to Firestore at `users/{uid}` (one document per user, live across devices). localStorage remains the local cache. On first sign-in an account with no data takes the browser's current data. Signing out clears the browser copy.

- `src/sync/config.js`: Firebase web config (public by design). Empty `apiKey` = accounts off, and Firebase isn't loaded.
- `src/sync/cloud.js`: auth + debounced upload + live listener.
- `firestore.rules`: each user can only read/write their own document. Paste into Firebase console → Firestore → Rules.
- Firebase console → Authentication → Settings → Authorized domains must include the deployed domain.

## Deploy (Vercel)

Vercel detects Vite automatically: build command `npm run build`, output directory `dist`. Push the repo to GitHub and import it in Vercel, or run `npx vercel` from this folder.
