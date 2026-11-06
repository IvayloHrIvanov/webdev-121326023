-- Migration: Update users and roles

-- 1. Remove organizer@example.com and owner@example.com if present
DELETE FROM group_operators WHERE user_id IN (SELECT id FROM users WHERE email IN ('organizer@example.com', 'owner@example.com'));
DELETE FROM memberships WHERE user_id IN (SELECT id FROM users WHERE email IN ('organizer@example.com', 'owner@example.com'));
DELETE FROM session_attendance WHERE user_id IN (SELECT id FROM users WHERE email IN ('organizer@example.com', 'owner@example.com'));
DELETE FROM users WHERE email IN ('organizer@example.com', 'owner@example.com');

-- 2. Insert new or update users (operator2, operator1, student2)
-- Note: '$2b$10$9fCCBd6Vn.Lv8zSQLDSZeu9csxN08sal0NQsVdb.KQ.axuWhR6YZe' represents the hashed version of 'password123'
INSERT OR IGNORE INTO users (email, password_hash, role) VALUES
('operator3@example.com', '$2b$10$9fCCBd6Vn.Lv8zSQLDSZeu9csxN08sal0NQsVdb.KQ.axuWhR6YZe', 'operator'),
('operator2@example.com', '$2b$10$9fCCBd6Vn.Lv8zSQLDSZeu9csxN08sal0NQsVdb.KQ.axuWhR6YZe', 'operator'),
('operator1@example.com', '$2b$10$9fCCBd6Vn.Lv8zSQLDSZeu9csxN08sal0NQsVdb.KQ.axuWhR6YZe', 'operator'),
('student2@example.com', '$2b$10$9fCCBd6Vn.Lv8zSQLDSZeu9csxN08sal0NQsVdb.KQ.axuWhR6YZe', 'student');

-- Ensure correct roles if they already existed
UPDATE users SET role = 'operator' WHERE email IN ('operator1@example.com', 'operator2@example.com', 'operator3@example.com');
UPDATE users SET role = 'student' WHERE email = 'student2@example.com';