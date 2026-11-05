import { getDb } from './db.js';

export function findUserByEmail(email) {
  const db = getDb();
  return db.get('SELECT * FROM users WHERE email = ?', [email]);
}

export function findUserById(id) {
  const db = getDb();
  return db.get('SELECT id, email, created_at FROM users WHERE id = ?', [id]);
}
