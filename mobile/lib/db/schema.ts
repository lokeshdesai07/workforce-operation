// Mobile SQLite schema. Mirrors backend domain tables, plus the outbox
// and sync_meta tables that exist only on the device.
//
// IMPORTANT: keep column names identical to the server so the same JSON
// payload works in both directions (apply_op + changes_since).

export const SCHEMA_VERSION = 1;

export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Domain mirrors
CREATE TABLE IF NOT EXISTS inspections (
  id            TEXT PRIMARY KEY,
  worker_id     TEXT NOT NULL,
  title         TEXT NOT NULL,
  site_address  TEXT,
  status        TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  version       INTEGER NOT NULL,
  deleted_at    TEXT
);

CREATE TABLE IF NOT EXISTS check_ins (
  id            TEXT PRIMARY KEY,
  inspection_id TEXT NOT NULL,
  occurred_at   TEXT NOT NULL,
  lat           REAL NOT NULL,
  lng           REAL NOT NULL,
  accuracy_m    REAL,
  updated_at    TEXT NOT NULL,
  version       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS check_outs (
  id            TEXT PRIMARY KEY,
  inspection_id TEXT NOT NULL,
  occurred_at   TEXT NOT NULL,
  lat           REAL NOT NULL,
  lng           REAL NOT NULL,
  accuracy_m    REAL,
  updated_at    TEXT NOT NULL,
  version       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS inspection_reports (
  id            TEXT PRIMARY KEY,
  inspection_id TEXT NOT NULL,
  notes         TEXT,
  status        TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  version       INTEGER NOT NULL
);

-- Outbox: every mutation lands here in the same transaction as the domain write.
-- Drained in op_id order (UUID v7 = time-ordered).
CREATE TABLE IF NOT EXISTS outbox (
  op_id            TEXT PRIMARY KEY,
  entity           TEXT NOT NULL,
  entity_id        TEXT NOT NULL,
  op_type          TEXT NOT NULL,           -- 'insert' | 'update' | 'delete'
  payload          TEXT NOT NULL,           -- JSON
  base_version     INTEGER NOT NULL,        -- server version we based this op on
  attempts         INTEGER NOT NULL DEFAULT 0,
  next_attempt_at  INTEGER NOT NULL,        -- epoch ms
  last_error       TEXT,
  state            TEXT NOT NULL DEFAULT 'pending',
                                            -- 'pending' | 'in_flight' | 'dead'
  created_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS outbox_state_next_idx
  ON outbox (state, next_attempt_at);

-- Sync metadata (cursors, etc).
CREATE TABLE IF NOT EXISTS sync_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- A local conflict log mirroring server-side sync_conflicts entries we've
-- received, so the Sync Inspector can show recent conflicts even offline.
CREATE TABLE IF NOT EXISTS local_conflicts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  op_id           TEXT NOT NULL,
  entity          TEXT NOT NULL,
  entity_id       TEXT NOT NULL,
  client_version  INTEGER NOT NULL,
  server_version  INTEGER NOT NULL,
  detected_at     INTEGER NOT NULL
);
`;
