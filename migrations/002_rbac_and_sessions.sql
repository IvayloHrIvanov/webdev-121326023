-- Migration 002: RBAC and Session End Time

-- 1. Add role to users if not exists (SQLite doesn't support ADD COLUMN IF NOT EXISTS directly, but we can handle it or assume a fresh db. Since this is a new migration, we use ALTER TABLE).
-- Note: In SQLite, ALTER TABLE ADD COLUMN is supported.
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('admin', 'operator', 'student'));

-- 2. Add end_time to sessions
ALTER TABLE sessions ADD COLUMN end_time DATETIME;

-- 3. Update existing seeded users with roles
UPDATE users SET role = 'admin' WHERE email = 'admin@example.com';
UPDATE users SET role = 'operator' WHERE email = 'organizer@example.com';
UPDATE users SET role = 'student' WHERE email = 'student@example.com';

-- Insert admin if not exists
INSERT OR IGNORE INTO users (id, email, password_hash, role) VALUES
(3, 'admin@example.com', '$2b$10$9fCCBd6Vn.Lv8zSQLDSZeu9csxN08sal0NQsVdb.KQ.axuWhR6YZe', 'admin');

-- Backfill end_time for existing sessions (default 1 hour after start_time)
UPDATE sessions SET end_time = datetime(start_time, '+1 hour') WHERE end_time IS NULL;
