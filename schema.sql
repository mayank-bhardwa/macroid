CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,        -- uuid
  email         TEXT NOT NULL UNIQUE,    -- lowercased
  password_hash TEXT NOT NULL,           -- PBKDF2-SHA256, base64
  salt          TEXT NOT NULL,           -- base64
  iterations    INTEGER NOT NULL,
  created_at    INTEGER NOT NULL         -- epoch ms
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,           -- 256-bit base64url
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS records (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  collection TEXT NOT NULL,
  scope      TEXT NOT NULL DEFAULT '',
  rec_id     TEXT NOT NULL,
  data       TEXT NOT NULL,              -- JSON
  updated_at INTEGER NOT NULL,           -- client-assigned epoch ms (LWW basis)
  deleted    INTEGER NOT NULL DEFAULT 0, -- tombstone
  PRIMARY KEY (user_id, collection, scope, rec_id)
);
CREATE INDEX IF NOT EXISTS idx_records_sync ON records(user_id, updated_at);

-- Append-only archive of prior values for mutable singleton documents
-- (e.g. plan, targets). Each time such a record is overwritten via /api/sync,
-- the value being replaced is snapshotted here, preserving full edit history.
-- Date/week/month-keyed collections are logs (each scope is its own record)
-- and are NOT versioned here.
CREATE TABLE IF NOT EXISTS record_versions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  collection  TEXT NOT NULL,
  scope       TEXT NOT NULL DEFAULT '',
  rec_id      TEXT NOT NULL,
  data        TEXT NOT NULL,              -- JSON snapshot of the prior value
  updated_at  INTEGER NOT NULL,           -- client updatedAt of the archived version
  deleted     INTEGER NOT NULL DEFAULT 0, -- whether the archived value was a tombstone
  archived_at INTEGER NOT NULL            -- server epoch ms when snapshot was taken
);
CREATE INDEX IF NOT EXISTS idx_record_versions_lookup
  ON record_versions(user_id, collection, scope, rec_id, archived_at);
