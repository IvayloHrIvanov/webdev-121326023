import { getDb } from '../src/data/db.js';
import bcrypt from 'bcrypt';

async function seed() {
  const db = getDb();
  
  const hashedPassword = await bcrypt.hash('password123', 10);

  // Insert users including student@example.com
  db.run('INSERT OR IGNORE INTO users (email, password_hash) VALUES (?, ?)', ['student@example.com', hashedPassword]);
  db.run('INSERT OR IGNORE INTO users (email, password_hash) VALUES (?, ?)', ['alice@example.com', hashedPassword]);
  db.run('INSERT OR IGNORE INTO users (email, password_hash) VALUES (?, ?)', ['bob@example.com', hashedPassword]);

  // Get user IDs
  const student = db.get('SELECT id FROM users WHERE email = ?', ['student@example.com']);
  const alice = db.get('SELECT id FROM users WHERE email = ?', ['alice@example.com']);
  const bob = db.get('SELECT id FROM users WHERE email = ?', ['bob@example.com']);

  // Insert groups
  const g1 = db.run('INSERT INTO groups (name, course_name, owner_id) VALUES (?, ?, ?)', ['Advanced Algorithms', 'CS 201', bob.id]);
  const g2 = db.run('INSERT INTO groups (name, course_name, owner_id) VALUES (?, ?, ?)', ['Linear Algebra Study', 'MATH 221', bob.id]);
  const g3 = db.run('INSERT INTO groups (name, course_name, owner_id) VALUES (?, ?, ?)', ['Web Engineering', 'CS 350', alice.id]);

  // Insert memberships (include student in all groups)
  db.run('INSERT OR IGNORE INTO memberships (user_id, group_id) VALUES (?, ?)', [student.id, g1.lastID]);
  db.run('INSERT OR IGNORE INTO memberships (user_id, group_id) VALUES (?, ?)', [student.id, g2.lastID]);
  db.run('INSERT OR IGNORE INTO memberships (user_id, group_id) VALUES (?, ?)', [student.id, g3.lastID]);
  db.run('INSERT OR IGNORE INTO memberships (user_id, group_id) VALUES (?, ?)', [alice.id, g1.lastID]);
  db.run('INSERT OR IGNORE INTO memberships (user_id, group_id) VALUES (?, ?)', [bob.id, g2.lastID]);

  // Insert future sessions
  db.run('INSERT INTO sessions (group_id, title, start_time) VALUES (?, ?, ?)', [g1.lastID, 'Graph Traversals (BFS/DFS)', '2030-06-01 14:00:00']);
  db.run('INSERT INTO sessions (group_id, title, start_time) VALUES (?, ?, ?)', [g1.lastID, 'Dynamic Programming Masterclass', '2030-06-05 14:00:00']);
  db.run('INSERT INTO sessions (group_id, title, start_time) VALUES (?, ?, ?)', [g2.lastID, 'Eigenvalues and Eigenvectors', '2030-06-03 10:00:00']);
  db.run('INSERT INTO sessions (group_id, title, start_time) VALUES (?, ?, ?)', [g3.lastID, 'Building REST APIs with Express', '2030-06-02 18:00:00']);

  console.log('Database seeded successfully with student@example.com and sessions!');
}

seed().catch(err => {
  console.error('Error seeding database:', err);
  process.exit(1);
});
