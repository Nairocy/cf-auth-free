-- cf-auth-free migration 001：账号资料 + 头像 + 网页登录态交接
-- 应用：npx wrangler d1 execute cf-auth-free --remote --file=migrations/001_account_profile.sql

ALTER TABLE users ADD COLUMN display_name   TEXT;
ALTER TABLE users ADD COLUMN preferred_name TEXT;
ALTER TABLE users ADD COLUMN preferences    TEXT;
ALTER TABLE users ADD COLUMN avatar_b64     TEXT;
ALTER TABLE users ADD COLUMN avatar_ver     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN updated_at     INTEGER;

CREATE TABLE IF NOT EXISTS handoff_tickets (
  code_hash  TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at    INTEGER
);

CREATE INDEX IF NOT EXISTS idx_handoff_exp ON handoff_tickets(expires_at);
