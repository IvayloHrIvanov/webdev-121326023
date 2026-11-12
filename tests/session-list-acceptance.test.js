import '../scripts/test-database-setup.js';
import { describe, it, before, beforeEach, after } from 'node:test';
import request from 'supertest';
import { expect } from 'chai';
import app from '../src/app.js';
import { getDb } from '../src/data/db.js';
import bcrypt from 'bcrypt';

const RUN_ID = `${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
const EMAIL = `student_s1_${RUN_ID}@example.com`;

describe('Session list acceptance tests', () => {
  let agent;
  let userId;
  let groupId;

  before(async () => {
    const db = getDb();
    const hashedPassword = await bcrypt.hash('password123', 10);
    const userRes = await db.run('INSERT INTO users (email, password_hash) VALUES (?, ?) RETURNING id', [EMAIL, hashedPassword]);
    userId = userRes.lastID;

    const groupRes = await db.run('INSERT INTO groups (name, course_name, owner_id) VALUES (?, ?, ?) RETURNING id', ['Math Group S1', 'Math 101', userId]);
    groupId = groupRes.lastID;

    await db.run('INSERT INTO memberships (user_id, group_id) VALUES (?, ?)', [userId, groupId]);

    await db.run('INSERT INTO sessions (group_id, title, start_time) VALUES (?, ?, ?)', [groupId, 'Calculus Workshop S1', '2030-01-02 10:00:00']);
    await db.run('INSERT INTO sessions (group_id, title, start_time) VALUES (?, ?, ?)', [groupId, 'Algebra Review S1', '2030-01-01 10:00:00']);
  });

  beforeEach(async () => {
    const db = getDb();
    await db.run('DELETE FROM sessions WHERE group_id = ?', [groupId]);
    await db.run('INSERT INTO sessions (group_id, title, start_time) VALUES (?, ?, ?)', [groupId, 'Calculus Workshop S1', '2030-01-02 10:00:00']);
    await db.run('INSERT INTO sessions (group_id, title, start_time) VALUES (?, ?, ?)', [groupId, 'Algebra Review S1', '2030-01-01 10:00:00']);
  });

  after(async () => {
    const db = getDb();
    if (userId) {
      await db.run('DELETE FROM session_attendance WHERE session_id IN (SELECT id FROM sessions WHERE group_id IN (SELECT id FROM groups WHERE owner_id = ?))', [userId]);
      await db.run('DELETE FROM group_operators WHERE group_id IN (SELECT id FROM groups WHERE owner_id = ?)', [userId]);
      await db.run('DELETE FROM sessions WHERE group_id IN (SELECT id FROM groups WHERE owner_id = ?)', [userId]);
      await db.run('DELETE FROM memberships WHERE user_id = ? OR group_id IN (SELECT id FROM groups WHERE owner_id = ?)', [userId, userId]);
      await db.run('DELETE FROM groups WHERE owner_id = ?', [userId]);
      await db.run('DELETE FROM users WHERE id = ?', [userId]);
    }
  });

  it('AC-9: A visitor who opens /sessions without signing in is redirected to /login', async () => {
    const res = await request(app).get('/sessions').redirects(0);
    expect(res.status).to.equal(302);
    expect(res.header.location).to.equal('/login');
  });

  it('AC-10 & AC-14: After signing in, /sessions shows upcoming sessions ordered by date/time (nearest first)', async () => {
    agent = request.agent(app);

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ email: EMAIL, password: 'password123' });

    expect(loginRes.status).to.equal(200);

    const res = await agent.get('/api/sessions');
    expect(res.status).to.equal(200);
    expect(res.body).to.be.an('array');
    expect(res.body.length).to.equal(2);
    expect(res.body[0].title).to.equal('Algebra Review S1');
    expect(res.body[1].title).to.equal('Calculus Workshop S1');
  });

  it('AC-11: If a scheduled session is deleted from the database, it no longer appears in the list', async () => {
    const db = getDb();
    await db.run('DELETE FROM sessions WHERE group_id = ? AND title = ?', [groupId, 'Algebra Review S1']);

    const res = await agent.get('/api/sessions');
    expect(res.status).to.equal(200);
    expect(res.body.length).to.equal(1);
    expect(res.body[0].title).to.equal('Calculus Workshop S1');
  });

  it('AC-12: If a user joins a study group and reloads /sessions, upcoming sessions appear', async () => {
    const db = getDb();
    // Create another group with a session, user not yet member
    const newGroupRes = await db.run('INSERT INTO groups (name, course_name, owner_id) VALUES (?, ?, ?) RETURNING id', ['History Group', 'History 101', userId]);
    const newGroupId = newGroupRes.lastID;
    await db.run('INSERT INTO sessions (group_id, title, start_time) VALUES (?, ?, ?)', [newGroupId, 'History Lecture', '2030-01-03 10:00:00']);

    // Initially not in sessions list
    let res = await agent.get('/api/sessions');
    expect(res.body.some(s => s.title === 'History Lecture')).to.be.false;

    // Join group
    await agent.post('/api/memberships').send({ groupId: newGroupId });

    // Now appears in sessions list
    res = await agent.get('/api/sessions');
    expect(res.body.some(s => s.title === 'History Lecture')).to.be.true;
  });

  it('AC-13: If all upcoming sessions of a group are removed, no sessions from that group are displayed', async () => {
    const db = getDb();
    await db.run('DELETE FROM sessions WHERE group_id = ?', [groupId]);
    await db.run('DELETE FROM sessions WHERE title = ?', ['History Lecture']);

    const res = await agent.get('/api/sessions');
    expect(res.body.length).to.equal(0);
  });
});
