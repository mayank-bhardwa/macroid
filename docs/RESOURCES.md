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

**Environment variables / vars** (declared in `wrangler.toml`)

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

- `wrangler.toml` is retained as the Cloudflare **Pages deployment config** — it
  declares the D1 binding (`DB`) and the `vars` above. Cloudflare applies these
  on Git-connected builds, so the file must stay even though the Wrangler CLI is
  no longer a project dependency. D1 schema/migrations can be run ad-hoc with
  `npx wrangler d1 execute recomp-db --remote --file=./schema.sql` (downloaded
  on demand) or from the Cloudflare dashboard.
- The D1 `database_id` in `wrangler.toml` is an account-scoped identifier, not a
  secret (Cloudflare's own docs commit it to source control).
- Connecting the repo to Cloudflare Pages (dashboard "Connect to Git") enables
  automatic deploys on every push to `main`.
