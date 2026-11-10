import { getDb } from './db.js';

export async function findUserByEmail(email) {
  const db = getDb();
  return await db.get('SELECT * FROM users WHERE email = ?', [email]);
}

export async function findUserById(id) {
  const db = getDb();
  return await db.get('SELECT id, email, role, created_at FROM users WHERE id = ?', [id]);
}

export async function getAllUsers() {
  const db = getDb();
  return await db.all('SELECT id, email, role FROM users');
}
