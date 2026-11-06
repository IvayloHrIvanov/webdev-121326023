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
      g.owner_id,
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
    SELECT g.id, g.name, g.course_name, g.owner_id,
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

export function createGroup(name, courseName, ownerId) {
  const db = getDb();
  const res = db.run('INSERT INTO groups (name, course_name, owner_id) VALUES (?, ?, ?)', [name, courseName, ownerId]);
  // Also automatically make the owner a member
  db.run('INSERT OR IGNORE INTO memberships (user_id, group_id) VALUES (?, ?)', [ownerId, res.lastID]);
  return res.lastID;
}

export function getGroupById(groupId) {
  const db = getDb();
  return db.get('SELECT * FROM groups WHERE id = ?', [groupId]);
}

export function getConflictingSession(groupId, startTime, endTime) {
  const db = getDb();
  // Overlap condition: (new_start < existing_end) AND (new_end > existing_start)
  const query = `
    SELECT * FROM sessions
    WHERE group_id = ?
      AND datetime(?) < datetime(end_time)
      AND datetime(?) > datetime(start_time)
  `;
  return db.get(query, [groupId, startTime, endTime]);
}

export function createSession(groupId, title, startTime, endTime) {
  const db = getDb();
  const res = db.run('INSERT INTO sessions (group_id, title, start_time, end_time) VALUES (?, ?, ?, ?)', [groupId, title, startTime, endTime]);
  return res.lastID;
}

export function getSessionById(sessionId) {
  const db = getDb();
  return db.get(`
    SELECT s.*, g.owner_id 
    FROM sessions s 
    JOIN groups g ON s.group_id = g.id 
    WHERE s.id = ?
  `, [sessionId]);
}

export function deleteSession(sessionId) {
  const db = getDb();
  return db.run('DELETE FROM sessions WHERE id = ?', [sessionId]);
}

export function deleteGroup(groupId) {
  const db = getDb();
  return db.run('DELETE FROM groups WHERE id = ?', [groupId]);
}

export function updateGroupOwner(groupId, newOwnerId) {
  const db = getDb();
  return db.run('UPDATE groups SET owner_id = ? WHERE id = ?', [newOwnerId, groupId]);
}

export function setSessionAttendance(userId, sessionId, status) {
  const db = getDb();
  return db.run(`
    INSERT INTO session_attendance (user_id, session_id, status)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, session_id) DO UPDATE SET status = excluded.status
  `, [userId, sessionId, status]);
}

export function getOperatorsForGroup(groupId) {
  const db = getDb();
  const ops = db.all('SELECT user_id FROM group_operators WHERE group_id = ?', [groupId]);
  if (ops.length > 0) return ops;
  const group = db.get('SELECT owner_id FROM groups WHERE id = ?', [groupId]);
  return group && group.owner_id ? [{ user_id: group.owner_id }] : [];
}

export function isGroupOperator(groupId, userId) {
  const db = getDb();
  const op = db.get('SELECT 1 FROM group_operators WHERE group_id = ? AND user_id = ?', [groupId, userId]);
  if (op) return true;
  const group = db.get('SELECT owner_id FROM groups WHERE id = ?', [groupId]);
  return Boolean(group && group.owner_id === userId);
}

export function setOperatorsForGroup(groupId, userIds) {
  const db = getDb();
  db.run('DELETE FROM group_operators WHERE group_id = ?', [groupId]);
  for (const uid of userIds) {
    if (uid) {
      db.run('INSERT OR IGNORE INTO group_operators (group_id, user_id) VALUES (?, ?)', [groupId, uid]);
    }
  }
}