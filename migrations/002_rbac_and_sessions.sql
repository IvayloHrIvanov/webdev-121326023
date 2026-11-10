-- Migration 002: RBAC and Session End Time (PostgreSQL)

ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('admin', 'operator', 'student'));
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS end_time TIMESTAMP;

UPDATE users SET role = 'admin' WHERE email = 'admin@example.com';
UPDATE users SET role = 'operator' WHERE email = 'organizer@example.com';
UPDATE users SET role = 'student' WHERE email = 'student@example.com';

INSERT INTO users (email, password_hash, role) VALUES
('admin@example.com', '$2b$10$9fCCBd6Vn.Lv8zSQLDSZeu9csxN08sal0NQsVdb.KQ.axuWhR6YZe', 'admin')
ON CONFLICT (email) DO NOTHING;

UPDATE sessions SET end_time = start_time + INTERVAL '1 hour' WHERE end_time IS NULL;
