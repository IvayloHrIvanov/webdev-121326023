import { getDb } from './db.js';

export function getUpcomingSessionsForUser(userId) {
  const db = getDb();
  const query = `
    SELECT
      s.id,
      s.title,
      s.start_time,
      g.id AS group_id,
      g.name AS group_name,
      g.course_name,
      COALESCE(sa.status, 'attending') AS attendance_status
    FROM sessions s
    JOIN groups g ON s.group_id = g.id
    JOIN memberships m ON g.id = m.group_id
    LEFT JOIN session_attendance sa ON sa.session_id = s.id AND sa.user_id = ?
    WHERE m.user_id = ? AND s.start_time >= datetime('now')
    ORDER BY s.start_time ASC
  `;
  return db.all(query, [userId, userId]);
}

export function getAllGroupsForUser(userId) {
  const db = getDb();
  const query = `
    SELECT g.id, g.name, g.course_name,
           EXISTS(SELECT 1 FROM memberships m WHERE m.group_id = g.id AND m.user_id = ?) AS is_member,
           (SELECT MIN(s.start_time) FROM sessions s WHERE s.group_id = g.id AND s.start_time >= datetime('now')) AS next_session
    FROM groups g
  `;
  return db.all(query, [userId]);
}

export function addMembership(userId, groupId) {
  const db = getDb();
  return db.run('INSERT OR IGNORE INTO memberships (user_id, group_id) VALUES (?, ?)', [userId, groupId]);
}

export function removeMembership(userId, groupId) {
  const db = getDb();
  return db.run('DELETE FROM memberships WHERE user_id = ? AND group_id = ?', [userId, groupId]);
}

export function setSessionAttendance(userId, sessionId, status) {
  const db = getDb();
  return db.run(`
    INSERT INTO session_attendance (user_id, session_id, status)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, session_id) DO UPDATE SET status = excluded.status
  `, [userId, sessionId, status]);
}