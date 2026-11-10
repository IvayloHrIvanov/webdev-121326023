import { getDb } from './db.js';

export async function getUpcomingSessionsForUser(userId) {
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
    WHERE m.user_id = ? AND s.start_time >= NOW()
    ORDER BY s.start_time ASC
  `;
  return await db.all(query, [userId, userId]);
}

export async function getAllGroupsForUser(userId) {
  const db = getDb();
  const query = `
    SELECT g.id, g.name, g.course_name, g.owner_id,
           (EXISTS(SELECT 1 FROM memberships m WHERE m.group_id = g.id AND m.user_id = ?))::int AS is_member,
           (SELECT MIN(s.start_time) FROM sessions s WHERE s.group_id = g.id AND s.start_time >= NOW()) AS next_session
    FROM groups g
  `;
  return await db.all(query, [userId]);
}

export async function addMembership(userId, groupId) {
  const db = getDb();
  return await db.run('INSERT INTO memberships (user_id, group_id) VALUES (?, ?) ON CONFLICT (user_id, group_id) DO NOTHING', [userId, groupId]);
}

export async function removeMembership(userId, groupId) {
  const db = getDb();
  return await db.run('DELETE FROM memberships WHERE user_id = ? AND group_id = ?', [userId, groupId]);
}

export async function createGroup(name, courseName, ownerId) {
  const db = getDb();
  const res = await db.run('INSERT INTO groups (name, course_name, owner_id) VALUES (?, ?, ?) RETURNING id', [name, courseName, ownerId]);
  const groupId = res.lastID;
  await db.run('INSERT INTO memberships (user_id, group_id) VALUES (?, ?) ON CONFLICT (user_id, group_id) DO NOTHING', [ownerId, groupId]);
  return groupId;
}

export async function getGroupById(groupId) {
  const db = getDb();
  return await db.get('SELECT * FROM groups WHERE id = ?', [groupId]);
}

export async function getConflictingSession(groupId, startTime, endTime) {
  const db = getDb();
  const query = `
    SELECT * FROM sessions
    WHERE group_id = ?
      AND ?::timestamp < end_time
      AND ?::timestamp > start_time
  `;
  return await db.get(query, [groupId, startTime, endTime]);
}

export async function createSession(groupId, title, startTime, endTime) {
  const db = getDb();
  const res = await db.run('INSERT INTO sessions (group_id, title, start_time, end_time) VALUES (?, ?, ?, ?) RETURNING id', [groupId, title, startTime, endTime]);
  return res.lastID;
}

export async function getSessionById(sessionId) {
  const db = getDb();
  return await db.get(`
    SELECT s.*, g.owner_id
    FROM sessions s
    JOIN groups g ON s.group_id = g.id
    WHERE s.id = ?
  `, [sessionId]);
}

export async function deleteSession(sessionId) {
  const db = getDb();
  return await db.run('DELETE FROM sessions WHERE id = ?', [sessionId]);
}

export async function deleteGroup(groupId) {
  const db = getDb();
  await db.run('DELETE FROM group_operators WHERE group_id = ?', [groupId]);
  await db.run('DELETE FROM memberships WHERE group_id = ?', [groupId]);
  await db.run('DELETE FROM sessions WHERE group_id = ?', [groupId]);
  return await db.run('DELETE FROM groups WHERE id = ?', [groupId]);
}

export async function updateGroupOwner(groupId, newOwnerId) {
  const db = getDb();
  return await db.run('UPDATE groups SET owner_id = ? WHERE id = ?', [newOwnerId, groupId]);
}

export async function setSessionAttendance(userId, sessionId, status) {
  const db = getDb();
  return await db.run(`
    INSERT INTO session_attendance (user_id, session_id, status)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, session_id) DO UPDATE SET status = EXCLUDED.status
  `, [userId, sessionId, status]);
}

export async function getOperatorsForGroup(groupId) {
  const db = getDb();
  const ops = await db.all('SELECT user_id FROM group_operators WHERE group_id = ?', [groupId]);
  if (ops.length > 0) return ops;
  const group = await db.get('SELECT owner_id FROM groups WHERE id = ?', [groupId]);
  return group && group.owner_id ? [{ user_id: group.owner_id }] : [];
}

export async function isGroupOperator(groupId, userId) {
  const db = getDb();
  const op = await db.get('SELECT 1 FROM group_operators WHERE group_id = ? AND user_id = ?', [groupId, userId]);
  if (op) return true;
  const group = await db.get('SELECT owner_id FROM groups WHERE id = ?', [groupId]);
  return Boolean(group && group.owner_id === userId);
}

export async function setOperatorsForGroup(groupId, userIds) {
  const db = getDb();
  await db.run('DELETE FROM group_operators WHERE group_id = ?', [groupId]);
  for (const uid of userIds) {
    if (uid) {
      await db.run('INSERT INTO group_operators (group_id, user_id) VALUES (?, ?) ON CONFLICT (group_id, user_id) DO NOTHING', [groupId, uid]);
    }
  }
}
