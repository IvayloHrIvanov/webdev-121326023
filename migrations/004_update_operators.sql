-- Migration 004: Update operators and seed operator3

UPDATE users SET email = 'operator2@example.com' WHERE (email = 'organizer@example.com' OR email = 'owner@example.com') AND NOT EXISTS (SELECT 1 FROM users WHERE email = 'operator2@example.com');

INSERT OR IGNORE INTO users (id, email, password_hash, role) VALUES
(4, 'operator3@example.com', '$2b$10$9fCCBd6Vn.Lv8zSQLDSZeu9csxN08sal0NQsVdb.KQ.axuWhR6YZe', 'operator');
