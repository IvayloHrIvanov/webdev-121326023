import { getDb } from './db.js';

export function getUpcomingSessionsForUser(userId) {
  const db = getDb();
  const query = `
    SELECT s.id, s.title, s.start_time, g.name AS group_name, g.course_name
    FROM sessions s
    JOIN groups g ON s.group_id = g.id
    JOIN memberships m ON g.id = m.group_id
    WHERE m.user_id = ? AND s.start_time >= datetime('now')
    ORDER BY s.start_time ASC
  `;
  return db.all(query, [userId]);
}

export function addMembership(userId, groupId) {
  const db = getDb();
  return db.run('INSERT OR IGNORE INTO memberships (user_id, group_id) VALUES (?, ?)', [userId, groupId]);
}
