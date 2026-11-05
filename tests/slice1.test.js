import { describe, it, before } from 'node:test';
import request from 'supertest';
import { expect } from 'chai';
import app from '../src/app.js';
import { getDb } from '../src/data/db.js';
import bcrypt from 'bcrypt';

describe('Slice 1 Acceptance Tests', () => {
  let agent;
  let userId;

  before(async () => {
    const db = getDb();
    db.run('DELETE FROM memberships');
    db.run('DELETE FROM sessions');
    db.run('DELETE FROM groups');
    db.run('DELETE FROM users');

    const hashedPassword = await bcrypt.hash('password123', 10);
    const userRes = db.run('INSERT INTO users (email, password_hash) VALUES (?, ?)', ['student@example.com', hashedPassword]);
    userId = userRes.lastID;

    const groupRes = db.run('INSERT INTO groups (name, course_name, owner_id) VALUES (?, ?, ?)', ['Math Group', 'Math 101', userId]);
    const groupId = groupRes.lastID;

    db.run('INSERT INTO memberships (user_id, group_id) VALUES (?, ?)', [userId, groupId]);

    db.run('INSERT INTO sessions (group_id, title, start_time) VALUES (?, ?, ?)', [groupId, 'Calculus Workshop', '2030-01-02 10:00:00']);
    db.run('INSERT INTO sessions (group_id, title, start_time) VALUES (?, ?, ?)', [groupId, 'Algebra Review', '2030-01-01 10:00:00']);
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
      .send({ email: 'student@example.com', password: 'password123' });

    expect(loginRes.status).to.equal(200);
    expect(loginRes.body.success).to.be.true;

    const res = await agent.get('/api/sessions');
    expect(res.status).to.equal(200);
    expect(res.body).to.be.an('array');
    expect(res.body.length).to.equal(2);
    expect(res.body[0].title).to.equal('Algebra Review');
    expect(res.body[1].title).to.equal('Calculus Workshop');
  });

  it('AC-11: If a scheduled session is deleted from the database, it no longer appears in the list', async () => {
    const db = getDb();
    db.run('DELETE FROM sessions WHERE title = ?', ['Algebra Review']);

    const res = await agent.get('/api/sessions');
    expect(res.status).to.equal(200);
    expect(res.body.length).to.equal(1);
    expect(res.body[0].title).to.equal('Calculus Workshop');
  });

  it('AC-12: If a user joins a study group and reloads /sessions, upcoming sessions appear', async () => {
    const db = getDb();
    const gRes = db.run('INSERT INTO groups (name, course_name, owner_id) VALUES (?, ?, ?)', ['Physics Group', 'Physics 101', userId]);
    const physicsGroupId = gRes.lastID;
    db.run('INSERT INTO sessions (group_id, title, start_time) VALUES (?, ?, ?)', [physicsGroupId, 'Quantum Mechanics', '2030-01-03 10:00:00']);

    let res = await agent.get('/api/sessions');
    expect(res.body.some(s => s.title === 'Quantum Mechanics')).to.be.false;

    const joinRes = await agent.post('/api/memberships').send({ groupId: physicsGroupId });
    expect(joinRes.status).to.equal(200);

    res = await agent.get('/api/sessions');
    expect(res.body.some(s => s.title === 'Quantum Mechanics')).to.be.true;
  });

  it('AC-13: If all upcoming sessions of a group are removed, no sessions from that group are displayed', async () => {
    const db = getDb();
    db.run('DELETE FROM sessions WHERE title = ?', ['Quantum Mechanics']);

    const res = await agent.get('/api/sessions');
    expect(res.body.some(s => s.title === 'Quantum Mechanics')).to.be.false;
  });
});
