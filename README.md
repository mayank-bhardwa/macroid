# Macroid

A mobile-first, installable Progressive Web App for personal nutrition and
body-recomposition tracking. Built with **React + Vite**, deployed to
**Cloudflare Pages** with a **Cloudflare D1** database for accounts and
multi-device sync.

Local storage is the source of truth — the app works fully offline. Signing in
is optional and enables bidirectional, last-write-wins sync across devices.

## Tech stack

- React 18 + Vite 5 + TypeScript (strict)
- Zustand store with manual `localStorage` persistence
- `vite-plugin-pwa` (Workbox) for offline + install
- Cloudflare Pages Functions (`/functions/api/*`) for the API
- Cloudflare D1 (SQLite) for users, sessions, and synced records
- Auth: PBKDF2-SHA256 password hashing, bearer session tokens

## Prerequisites

- Node 18+
- `pnpm` (`corepack enable` then `pnpm i`)

## Install

```sh
pnpm install
```

## Local development

The app **requires an account** (login/registration is enforced before the UI
loads), so the `/api/*` Functions and the local D1 database must be running in
dev. Vite serves the UI on **port 5173** and proxies `/api/*` to the Wrangler
backend on port 8788, so **the only URL you ever open is http://localhost:5173**.

1. Initialize the local D1 schema (first run only):

   ```sh
   pnpm db:init
   ```

   This applies [`schema.sql`](schema.sql) to the local D1 database named
   `macroid-db` (persisted under `.wrangler/`).

2. Start the dev environment (Vite + Wrangler backend together):

   ```sh
   pnpm dev:full
   ```

   - Open only: http://localhost:5173
   - Vite (5173) serves the UI with HMR and proxies `/api/*` to Wrangler.
   - Wrangler (8788) runs the Functions + D1 in the background — you never
     open it directly.

   To run the pieces separately (e.g. in two terminals) use `pnpm server`
   (backend on 8788) and `pnpm dev` (Vite on 5173).

### Notes on the local config

- [`wrangler.local.toml`](wrangler.local.toml) is used **only for local
  development and `d1 execute`**. It is intentionally separate so that the
  Cloudflare Pages Git build does not pick it up.
- `database_id` is set to `macroid-db` so that `wrangler d1 execute -c
  wrangler.local.toml` and `wrangler pages dev --d1 DB=macroid-db` operate on
  the **same** local SQLite database.
- `wrangler pages dev` does not accept `-c <file>`, so bindings are passed as
  flags in the `server` / `dev:full` scripts.

### Verifying the API locally

```sh
# Register (expect HTTP 201 with a token) — via the Vite proxy on 5173
curl -X POST http://localhost:5173/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"supersecret"}'

# Inspect the local database
npx wrangler d1 execute macroid-db --local -c wrangler.local.toml \
  --command "SELECT email FROM users;"
```

## Build

```sh
pnpm build      # tsc -b && vite build -> dist/
pnpm preview    # preview the production build
```

## Deploy to Cloudflare Pages

1. Push this repository to GitHub.
2. In the Cloudflare dashboard, create a **Pages** project connected to the repo:
   - **Build command:** `pnpm build`
   - **Build output directory:** `dist`
3. Create a D1 database and run the schema against it:

   ```sh
   npx wrangler d1 create macroid-db
   npx wrangler d1 execute macroid-db --remote --file=./schema.sql
   ```

4. In the Pages project settings, add the **D1 binding** and environment
   variables (Production and Preview):
   - Binding: `DB` → your `macroid-db` database
   - Variable: `SESSION_TTL_DAYS` = `90`
   - Variable: `ALLOW_REGISTRATION` = `true`
5. Trigger a deploy. The Functions in `/functions` are deployed automatically.

To disable new sign-ups after launch, set `ALLOW_REGISTRATION` to `false`.

## Project layout

```
functions/            Cloudflare Pages Functions (the /api/* backend)
  _lib.ts             Shared helpers (auth, crypto, env, JSON)
  _middleware.ts      CORS
  api/auth/*.ts       register / login / logout / me
  api/sync.ts         bidirectional last-write-wins sync
public/               Static assets, _headers, _redirects, plans/, icons/
src/
  lib/                Pure logic: dates, macros, units, day-types, plan, api
  store/              Zustand store, persistence, sync serialization
  components/         Reusable UI (rings, sheet, charts, toast, icons)
  tabs/               Macros, Daily, Trends, Prep, Grocery
  Settings.tsx        Defaults editors + sync/data management
schema.sql            D1 schema (users, sessions, records)
wrangler.local.toml   Local-dev-only Wrangler config
```

## Data & privacy

- All tracking data lives in the browser's `localStorage` under the `macroid:`
  prefix and is fully usable offline.
- When signed in, records are synced to your D1 database keyed to your account.
  Sync is per-record last-write-wins by timestamp.
- Passwords are never stored in plain text (PBKDF2-SHA256).
</content>
</invoke>
