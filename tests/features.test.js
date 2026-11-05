import request from 'supertest';
import { expect } from 'chai';
import app from '../src/app.js';
import { getDb } from '../src/data/db.js';
import bcrypt from 'bcrypt';

describe('New Features Acceptance Tests', () => {
  let agent;
  let userId;
  let mathGroupId;

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
    mathGroupId = groupRes.lastID;

    db.run('INSERT INTO sessions (group_id, title, start_time) VALUES (?, ?, ?)', [mathGroupId, 'Algebra Review', '2030-01-01 14:30:00']);
    
    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'student@example.com', password: 'password123' });
  });

  it('AC-15: A user can leave a group', async () => {
    // First join (should already be joined by seed if I wanted, but let's be explicit)
    await agent.post('/api/memberships').send({ groupId: mathGroupId });
    
    let res = await agent.get('/api/groups');
    let mathGroup = res.body.find(g => g.id === mathGroupId);
    expect(mathGroup.is_member).to.equal(1);

    // Leave
    const leaveRes = await agent.delete('/api/memberships').send({ groupId: mathGroupId });
    expect(leaveRes.status).to.equal(200);

    res = await agent.get('/api/groups');
    mathGroup = res.body.find(g => g.id === mathGroupId);
    expect(mathGroup.is_member).to.equal(0);
  });

  it('AC-16: Available groups show next session time', async () => {
    const res = await agent.get('/api/groups');
    const mathGroup = res.body.find(g => g.id === mathGroupId);
    expect(mathGroup.next_session).to.equal('2030-01-01 14:30:00');
  });

  it('AC-17: Dates/times are handled in 24h format', async () => {
    // Rejoin to see sessions
    await agent.post('/api/memberships').send({ groupId: mathGroupId });
    
    const res = await agent.get('/api/sessions');
    expect(res.body[0].start_time).to.contain('14:30:00');
  });
});
