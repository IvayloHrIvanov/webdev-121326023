-- Initial schema for Slice 1 (SQLite compatible)

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    course_name TEXT NOT NULL,
    owner_id INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS memberships (
    user_id INTEGER REFERENCES users(id),
    group_id INTEGER REFERENCES groups(id),
    PRIMARY KEY (user_id, group_id)
);

CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    start_time DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed data
-- Passwords are 'password123' hashed with bcrypt (cost 10)
-- $2b$10$nOUIs5kJ7kp44yvj/T366.S.OAn7S88XmN9s4T6D8j5O.v9u/kG6.

INSERT INTO users (email, password_hash) VALUES 
('student@example.com', '$2b$10$nOUIs5kJ7kp44yvj/T366.S.OAn7S88XmN9s4T6D8j5O.v9u/kG6.'),
('organizer@example.com', '$2b$10$nOUIs5kJ7kp44yvj/T366.S.OAn7S88XmN9s4T6D8j5O.v9u/kG6.');

INSERT INTO groups (name, course_name, owner_id) VALUES 
('Math Study Group', 'Mathematics 101', 2),
('CS Basics', 'Computer Science 50', 2);

INSERT INTO memberships (user_id, group_id) VALUES 
(1, 1), -- Student joins Math
(1, 2), -- Student joins CS
(2, 1), -- Organizer is in Math
(2, 2); -- Organizer is in CS

-- Some sessions in the future, some in the past
-- SQLite date functions: datetime('now', '+2 days')
INSERT INTO sessions (group_id, title, start_time) VALUES 
(1, 'Algebra Review', datetime('now', '+2 days')),
(1, 'Calculus Workshop', datetime('now', '+5 days')),
(2, 'Binary Trees', datetime('now', '+1 day')),
(2, 'Intro to C', datetime('now', '-1 day')); -- Past session
