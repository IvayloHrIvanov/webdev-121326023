import { getDb } from './db.js';

export function findUserByEmail(email) {
  const db = getDb();
  return db.get('SELECT * FROM users WHERE email = ?', [email]);
}

export function findUserById(id) {
  const db = getDb();
  return db.get('SELECT id, email, role, created_at FROM users WHERE id = ?', [id]);
}

export function getAllUsers() {
  const db = getDb();
  return db.all('SELECT id, email, role FROM users');
}
