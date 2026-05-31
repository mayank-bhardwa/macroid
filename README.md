# Macroid

A body-recomposition tracker built as an offline-first Astro PWA with optional
multi-user cloud sync on Cloudflare Pages + D1.

Log your daily macros, water, meal prep, and grocery/stock, and watch the
trends — all on your phone, installable as an app, working fully offline.

## Features

- **Macros** — log meals against protein / carbs / fats / calorie targets with
  Apple-Fitness-style progress rings and a remaining-budget readout.
- **Water** — quick +/- glass tracking toward a daily goal.
- **Daily meal prep** — per-day prescriptive meal plan with "packed" vs "eaten"
  states; training/rest day swapping.
- **Grocery & stock** — weekly grocery lists and monthly stock with low-stock
  reorder flagging.
- **Trends** — daily / weekly / monthly / yearly breakdowns of protein and
  calories.
- **Offline-first** — everything persists to `localStorage`; the app works with
  no network and no account.
- **Cloud sync (optional)** — create an account to sync records across devices.
  Per-record, last-write-wins sync with tombstones over a Cloudflare D1 backend.
- **Per-day target history** — past days keep the targets they were logged
  under, so changing your defaults never rewrites history.

## Tech stack

- [Astro](https://astro.build/) static site + `@vite-pwa/astro` service worker
- Vanilla ES modules (no UI framework) under `src/scripts/`
- [Cloudflare Pages](https://pages.cloudflare.com/) hosting
- [Cloudflare Pages Functions](https://developers.cloudflare.com/pages/functions/)
  for the `/api/*` backend
- [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite) for storage
- Auth via PBKDF2-SHA256 (Web Crypto) + opaque bearer session tokens

## Project structure

```
src/
  pages/index.astro      App shell markup
  layouts/Base.astro     HTML head, PWA wiring
  scripts/               app.js orchestrator + cloudSync / constants / dom / utils
  styles/global.css      Styles
functions/
  _lib/                  http, crypto, auth helpers
  _middleware.js         CORS
  api/auth/              register / login / logout / me
  api/sync.js            Per-record sync endpoint
public/
  _headers               Cloudflare security headers (CSP, HSTS, ...)
  _redirects             SPA fallback
  plans/                 Monthly plan JSON
schema.sql               D1 schema (users / sessions / records)
wrangler.toml            Cloudflare config
```

## Local development

Requires the Node version in [`.nvmrc`](.nvmrc) and [pnpm](https://pnpm.io)
(version pinned via the `packageManager` field in [`package.json`](package.json)).

```bash
pnpm install
pnpm dev          # http://localhost:4321
pnpm build        # outputs to dist/
```

The app runs fully offline with `localStorage`; the D1 sync backend needs the
Cloudflare runtime:

```bash
npx wrangler pages dev   # serves Pages Functions + a local D1 binding
```

## Deployment (Cloudflare Pages)

1. `npx wrangler d1 create recomp-db` and paste the returned `database_id` into
   [`wrangler.toml`](wrangler.toml).
2. Apply the schema:
   `npx wrangler d1 execute recomp-db --remote --file=./schema.sql`.
3. In the Cloudflare Pages dashboard, set build command `pnpm build`, output
   directory `dist`, and env var `BASE_PATH=/`.

## Branching & contributions

- `main` — production. **Only updated via a PR from `develop`.** Direct pushes
  are blocked.
- `develop` — integration branch. **Updated only via PR.** Direct pushes are
  blocked. Branch off `develop` for features, then open a PR back into it.

Every PR must pass the **Build** check, and PRs into `main` must additionally
pass the **PR source must be develop** check.

## License

Private project — all rights reserved.
