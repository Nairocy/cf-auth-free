-- cf-auth-free schema (D1 / SQLite)
-- 应用: wrangler d1 execute cf-auth-free --local --file=schema.sql

CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  display_name   TEXT,
  preferred_name TEXT,
  preferences    TEXT,
  avatar_b64     TEXT,
  avatar_ver     INTEGER NOT NULL DEFAULT 0,
  updated_at     INTEGER
);

CREATE TABLE IF NOT EXISTS handoff_tickets (
  code_hash  TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at    INTEGER
);

CREATE INDEX IF NOT EXISTS idx_handoff_exp ON handoff_tickets(expires_at);

CREATE TABLE IF NOT EXISTS email_codes (
  email      TEXT PRIMARY KEY,
  code_hash  TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  sent_at    INTEGER NOT NULL,
  ip_hash    TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_exp     ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at);

CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);

/* ---------------- 兑换码订阅（migration 003） ---------------- */

CREATE TABLE IF NOT EXISTS subscriptions (
  user_id    TEXT PRIMARY KEY,
  plan       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'active',
  started_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_subs_exp ON subscriptions(expires_at);

CREATE TABLE IF NOT EXISTS redeem_codes (
  code_hash  TEXT PRIMARY KEY,
  code       TEXT NOT NULL,
  code_mask  TEXT NOT NULL,
  plan       TEXT NOT NULL,
  days       INTEGER NOT NULL DEFAULT 30,
  batch      TEXT,
  status     TEXT NOT NULL DEFAULT 'unused',
  user_id    TEXT,
  used_at    INTEGER,
  created_at INTEGER NOT NULL,
  note       TEXT
);
CREATE INDEX IF NOT EXISTS idx_codes_batch ON redeem_codes(batch);
CREATE INDEX IF NOT EXISTS idx_codes_user  ON redeem_codes(user_id);

CREATE TABLE IF NOT EXISTS redeem_logs (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL,
  code_hash      TEXT NOT NULL,
  plan           TEXT NOT NULL,
  days           INTEGER NOT NULL,
  before_expires INTEGER,
  after_expires  INTEGER NOT NULL,
  ip_hash        TEXT,
  created_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_logs_user ON redeem_logs(user_id);

CREATE TABLE IF NOT EXISTS usage_daily (
  user_id    TEXT NOT NULL,
  day        TEXT NOT NULL,
  requests   INTEGER NOT NULL DEFAULT 0,
  tokens_in  INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
