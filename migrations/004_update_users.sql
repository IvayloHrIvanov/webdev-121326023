-- Migration: Update users and roles (PostgreSQL, non-destructive & idempotent)

-- Insert new operators and students if they do not exist
INSERT INTO users (email, password_hash, role) VALUES
('operator2@example.com', '$2b$10$9fCCBd6Vn.Lv8zSQLDSZeu9csxN08sal0NQsVdb.KQ.axuWhR6YZe', 'operator'),
('operator1@example.com', '$2b$10$9fCCBd6Vn.Lv8zSQLDSZeu9csxN08sal0NQsVdb.KQ.axuWhR6YZe', 'operator'),
('student2@example.com', '$2b$10$9fCCBd6Vn.Lv8zSQLDSZeu9csxN08sal0NQsVdb.KQ.axuWhR6YZe', 'student')
ON CONFLICT (email) DO NOTHING;

-- Ensure correct roles
UPDATE users SET role = 'operator' WHERE email IN ('operator1@example.com', 'operator2@example.com');
UPDATE users SET role = 'student' WHERE email IN ('student@example.com', 'student2@example.com');
UPDATE users SET role = 'admin' WHERE email = 'admin@example.com';
