-- cf-auth-free migration 002：会话展示用的 UA
ALTER TABLE sessions ADD COLUMN user_agent TEXT;

CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at);
