# Do Date

See how much time your commitments really take. Every task adds its time to a tank; finishing tasks drains it. Set how many hours a day you can work and it projects a finish date that moves as the project grows or shrinks.

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
    model.js          data shape, defaults, sample album, validation, totals
    store.js          the live state, localStorage persistence, commit/subscribe
  ui/                 one module per area of the page
    tank.js           animated SVG tank, tooltips, +/- markers
    list.js           song cards, tasks, quick-add, drag to reorder
    stats.js          headline numbers, finish date, weekly scope line
    settings.js       project name, pace, settings drawer, import/export
    theme.js          auto/light/dark
    toast.js          notifications with undo
    dom.js            small DOM helpers
  styles/             tokens.css (colors) + one stylesheet per area
tests/                Vitest; app.smoke.test.js boots the real page in jsdom
```

Data flow: UI handlers mutate `state` from `store.js`, then call `commit(opts)`. That saves to localStorage and notifies `main.js`, which re-renders stats and the tank (and the list/settings when `opts` asks for it).

## Data

Everything is stored in the browser's localStorage under `dodate.v1`, so it is per-browser and per-device. Use Settings → Export JSON for backups or to move between devices.

## Deploy (Vercel)

Vercel detects Vite automatically: build command `npm run build`, output directory `dist`. Push the repo to GitHub and import it in Vercel, or run `npx vercel` from this folder.
