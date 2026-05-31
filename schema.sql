-- Recomp Tracker — Cloudflare D1 schema
-- Apply remote:  npx wrangler d1 execute recomp-db --remote --file=./schema.sql
--   (Wrangler is fetched on demand via npx; it is not a project dependency.)

-- ---- Users (multi-user auth) ----
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,        -- random uuid
  email         TEXT NOT NULL UNIQUE,    -- stored lowercased
  password_hash TEXT NOT NULL,           -- PBKDF2-SHA256, base64
  salt          TEXT NOT NULL,           -- per-user random salt, base64
  iterations    INTEGER NOT NULL,        -- PBKDF2 iteration count
  created_at    INTEGER NOT NULL         -- epoch ms
);

-- ---- Sessions (opaque bearer tokens) ----
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,           -- random 256-bit, base64url
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- ---- Per-record sync store (soft-schema) ----
-- Every leaf record of the app's State becomes one row. This lets the client
-- sync individual records (offline-first, last-write-wins) without a separate
-- table/endpoint per collection.
--   collection : 'macroLog' | 'water' | 'targetHistory' | 'morningPrep'
--                | 'dayOverride' | 'mealPrep' | 'weeklyGrocery'
--                | 'monthlyGrocery' | 'recentMeal' | 'meta'
--   scope      : the date/week/month partition key ('' for singletons)
--   rec_id     : record id unique within (collection, scope)
--   data       : JSON blob of the record's value
--   updated_at : client-assigned epoch ms; basis for last-write-wins
--   deleted    : 1 = tombstone (propagates deletions to other devices)
CREATE TABLE IF NOT EXISTS records (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  collection TEXT NOT NULL,
  scope      TEXT NOT NULL DEFAULT '',
  rec_id     TEXT NOT NULL,
  data       TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, collection, scope, rec_id)
);
-- Drives the "pull changes since cursor" query.
CREATE INDEX IF NOT EXISTS idx_records_sync ON records(user_id, updated_at);
