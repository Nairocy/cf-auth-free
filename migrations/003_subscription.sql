-- cf-auth-free migration 003：兑换码订阅（套餐 / 兑换码 / 兑换流水 / 每日用量）
-- 应用：npx wrangler d1 execute cf-auth-free --remote --file=migrations/003_subscription.sql
-- 全部 IF NOT EXISTS，可重复执行。

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
