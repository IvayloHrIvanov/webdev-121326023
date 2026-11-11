-- Initial schema for Slice 1 (PostgreSQL compatible)

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS groups (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    course_name TEXT NOT NULL,
    owner_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS memberships (
    user_id INTEGER REFERENCES users(id),
    group_id INTEGER REFERENCES groups(id),
    PRIMARY KEY (user_id, group_id)
);

CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    start_time TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS session_attendance (
    user_id INTEGER REFERENCES users(id),
    session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK(status IN ('attending', 'not_attending')),
    PRIMARY KEY (user_id, session_id)
);

-- Seed data using email lookups instead of hardcoded IDs
INSERT INTO users (email, password_hash) VALUES
('student@example.com', '$2b$10$9fCCBd6Vn.Lv8zSQLDSZeu9csxN08sal0NQsVdb.KQ.axuWhR6YZe'),
('operator@example.com', '$2b$10$9fCCBd6Vn.Lv8zSQLDSZeu9csxN08sal0NQsVdb.KQ.axuWhR6YZe')
ON CONFLICT (email) DO NOTHING;

INSERT INTO groups (name, course_name, owner_id)
SELECT 'Math Study Group', 'Mathematics 101', id FROM users WHERE email = 'operator@example.com'
ON CONFLICT DO NOTHING;

INSERT INTO groups (name, course_name, owner_id)
SELECT 'CS Basics', 'Computer Science 50', id FROM users WHERE email = 'operator@example.com'
ON CONFLICT DO NOTHING;

INSERT INTO memberships (user_id, group_id)
SELECT u.id, g.id FROM users u, groups g
WHERE u.email = 'student@example.com' AND g.name IN ('Math Study Group', 'CS Basics')
ON CONFLICT (user_id, group_id) DO NOTHING;

INSERT INTO memberships (user_id, group_id)
SELECT u.id, g.id FROM users u, groups g
WHERE u.email = 'operator@example.com' AND g.name IN ('Math Study Group', 'CS Basics')
ON CONFLICT (user_id, group_id) DO NOTHING;

INSERT INTO sessions (group_id, title, start_time)
SELECT g.id, 'Algebra Review', NOW() + INTERVAL '2 days' FROM groups g WHERE g.name = 'Math Study Group'
AND NOT EXISTS (SELECT 1 FROM sessions WHERE group_id = g.id AND title = 'Algebra Review');

INSERT INTO sessions (group_id, title, start_time)
SELECT g.id, 'Calculus Workshop', NOW() + INTERVAL '5 days' FROM groups g WHERE g.name = 'Math Study Group'
AND NOT EXISTS (SELECT 1 FROM sessions WHERE group_id = g.id AND title = 'Calculus Workshop');

INSERT INTO sessions (group_id, title, start_time)
SELECT g.id, 'Binary Trees', NOW() + INTERVAL '1 day' FROM groups g WHERE g.name = 'CS Basics'
AND NOT EXISTS (SELECT 1 FROM sessions WHERE group_id = g.id AND title = 'Binary Trees');

INSERT INTO sessions (group_id, title, start_time)
SELECT g.id, 'Intro to C', NOW() - INTERVAL '1 day' FROM groups g WHERE g.name = 'CS Basics'
AND NOT EXISTS (SELECT 1 FROM sessions WHERE group_id = g.id AND title = 'Intro to C');
