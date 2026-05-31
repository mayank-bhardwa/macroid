# Macroid — Cloud Resources

Inventory of every external resource provisioned for **Macroid**. All resources
are on free tiers.

## GitHub

| Resource | Value |
| --- | --- |
| Repository | [`mayank-bhardwa/macroid`](https://github.com/mayank-bhardwa/macroid) (public) |
| Default branch | `main` |
| Working branch | `develop` |
| Package manager | pnpm (`packageManager` pinned in `package.json`) |

**Branch protection** (both `main` and `develop`):

- Pull request required before merging
- Required status check: `pnpm build`
- No force-pushes, no branch deletion, admins included (`enforce_admins`)
- `main` additionally requires the `PR source must be develop` check, so `main`
  only ever receives changes from `develop`.

**Workflows** (`.github/workflows/`):

- `build.yml` — runs `pnpm install --frozen-lockfile` + `pnpm build` on every PR
  into `main`/`develop` (the `pnpm build` status check).
- `enforce-main-source.yml` — fails any PR into `main` whose head branch is not
  `develop`.

**Security features** (free on public repos):

- Dependabot vulnerability alerts + automated security fixes
- Secret scanning + push protection

## Cloudflare

| Resource | Value |
| --- | --- |
| Account | `mayank85277@gmail.com` |
| Pages project | `macroid` |
| Production URL | <https://macroid.pages.dev> |
| Production branch | `main` |
| D1 database | `recomp-db` (region APAC) |
| D1 binding (in Functions) | `env.DB` |

**Pages build settings**

- Build command: `pnpm build`
- Build output directory: `dist`
- Root directory: `/`
- `BASE_PATH=/` (Astro serves from root)

**Bindings & vars** (configured in the Cloudflare Pages dashboard →
Settings → Functions)

- D1 binding: `DB` → `recomp-db`
- `SESSION_TTL_DAYS=90` — login session lifetime
- `ALLOW_REGISTRATION=true` — toggles `/api/auth/register`

**D1 schema** (`schema.sql`) — three tables:

- `users` — `id, email, password_hash, salt, iterations, created_at`
- `sessions` — `token, user_id, created_at, expires_at`
- `records` — per-user synced app data (last-write-wins, soft deletes)

**Pages Functions** (`functions/` → `/api/*`)

- `api/auth/register`, `api/auth/login`, `api/auth/logout`, `api/auth/me`
- `api/sync` — offline-first, per-record last-write-wins sync
- `_middleware.js` — CORS; `_lib/` — crypto (PBKDF2-SHA256), auth, HTTP helpers

## Notes

- Bindings and vars are managed in the **Cloudflare Pages dashboard** (Settings
  → Functions → Bindings). The repo no longer ships a `wrangler.toml`; the
  Git-connected project sources its D1 binding and vars from the dashboard.
- D1 schema/migrations can be run ad-hoc with
  `npx wrangler d1 execute recomp-db --remote --file=./schema.sql` (Wrangler is
  fetched on demand via `npx`; it is not a project dependency) or from the
  Cloudflare dashboard.
- The repo is connected to Cloudflare Pages, so every push to `main` builds and
  deploys automatically.
