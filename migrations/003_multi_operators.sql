-- Migration 003: Multi-operator support for groups (PostgreSQL)

CREATE TABLE IF NOT EXISTS group_operators (
    group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, user_id)
);

INSERT INTO group_operators (group_id, user_id)
SELECT id, owner_id FROM groups WHERE owner_id IS NOT NULL
ON CONFLICT (group_id, user_id) DO NOTHING;
