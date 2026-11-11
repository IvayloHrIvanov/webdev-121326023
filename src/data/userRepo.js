import { getDb } from './db.js';

export async function findUserByEmail(email) {
  const db = getDb();
  const lowerEmail = email ? email.toLowerCase() : email;
  return await db.get('SELECT * FROM users WHERE email = ?', [lowerEmail]);
}

export async function findUserByGoogleId(googleId) {
  const db = getDb();
  return await db.get('SELECT id, email, role FROM users WHERE google_id = ?', [googleId]);
}

export async function findUserById(id) {
  const db = getDb();
  return await db.get('SELECT id, email, role, created_at FROM users WHERE id = ?', [id]);
}

export async function findUserByIdWithPassword(id) {
  const db = getDb();
  return await db.get('SELECT * FROM users WHERE id = ?', [id]);
}

export async function getAllUsers() {
  const db = getDb();
  return await db.all('SELECT id, email, role FROM users');
}

export async function createUser(email, passwordHash, role = 'student') {
  const db = getDb();
  const lowerEmail = email ? email.toLowerCase() : email;
  const res = await db.run(
    'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?) RETURNING id',
    [lowerEmail, passwordHash, role]
  );
  return res.lastID;
}

export async function createGoogleUser(email, passwordHash, googleId) {
  const db = getDb();
  return await db.get(
    'INSERT INTO users (email, password_hash, google_id) VALUES (?, ?, ?) RETURNING id, email, role',
    [email.toLowerCase(), passwordHash, googleId]
  );
}

export async function updateUser(id, { email, role, passwordHash }) {
  const db = getDb();
  const lowerEmail = email ? email.toLowerCase() : email;
  if (passwordHash) {
    return await db.run(
      'UPDATE users SET email = ?, role = ?, password_hash = ? WHERE id = ?',
      [lowerEmail, role, passwordHash, id]
    );
  } else {
    return await db.run(
      'UPDATE users SET email = ?, role = ? WHERE id = ?',
      [lowerEmail, role, id]
    );
  }
}

export async function deleteUser(userId) {
  const db = getDb();
  await db.run('DELETE FROM session_attendance WHERE user_id = ?', [userId]);
  await db.run('DELETE FROM memberships WHERE user_id = ?', [userId]);
  await db.run('DELETE FROM group_operators WHERE user_id = ?', [userId]);
  const ownedGroups = await db.all('SELECT id FROM groups WHERE owner_id = ?', [userId]);
  for (const g of ownedGroups) {
    await db.run('DELETE FROM group_operators WHERE group_id = ?', [g.id]);
    await db.run('DELETE FROM memberships WHERE group_id = ?', [g.id]);
    await db.run('DELETE FROM sessions WHERE group_id = ?', [g.id]);
    await db.run('DELETE FROM groups WHERE id = ?', [g.id]);
  }
  return await db.run('DELETE FROM users WHERE id = ?', [userId]);
}
