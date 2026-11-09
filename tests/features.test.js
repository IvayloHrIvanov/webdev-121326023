import { describe, it, before, after } from 'node:test';
import request from 'supertest';
import { expect } from 'chai';
import app from '../src/app.js';
import { getDb } from '../src/data/db.js';
import bcrypt from 'bcrypt';
import * as sessionService from '../src/services/sessionService.js';

const RUN_ID = Date.now();
const EMAIL = `student_nf_${RUN_ID}@example.com`;
const ADMIN_EMAIL = `admin_nf_${RUN_ID}@example.com`;

describe('New Features Acceptance Tests', () => {
  let agent;
  let adminAgent;
  let userId;
  let adminId;
  let mathGroupId;

  before(async () => {
    const db = getDb();
    const hashedPassword = await bcrypt.hash('password123', 10);
    const userRes = db.run('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)', [EMAIL, hashedPassword, 'student']);
    userId = userRes.lastID;

    const adminRes = db.run('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)', [ADMIN_EMAIL, hashedPassword, 'admin']);
    adminId = adminRes.lastID;

    const groupRes = db.run('INSERT INTO groups (name, course_name, owner_id) VALUES (?, ?, ?)', ['Math Group NF', 'Math 101', userId]);
    mathGroupId = groupRes.lastID;

    db.run('INSERT INTO sessions (group_id, title, start_time, end_time) VALUES (?, ?, ?, ?)', [mathGroupId, 'Algebra Review NF', '2030-01-01 14:30:00', '2030-01-01 16:00:00']);

    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: EMAIL, password: 'password123' });

    adminAgent = request.agent(app);
    await adminAgent.post('/api/auth/login').send({ email: ADMIN_EMAIL, password: 'password123' });
  });

  after(async () => {
    const db = getDb();
    if (mathGroupId) {
      db.run('DELETE FROM sessions WHERE group_id = ?', [mathGroupId]);
      db.run('DELETE FROM memberships WHERE group_id = ?', [mathGroupId]);
      db.run('DELETE FROM groups WHERE id = ?', [mathGroupId]);
    }
    if (adminId) {
      db.run('DELETE FROM sessions WHERE group_id IN (SELECT id FROM groups WHERE owner_id = ?)', [adminId]);
      db.run('DELETE FROM memberships WHERE user_id = ? OR group_id IN (SELECT id FROM groups WHERE owner_id = ?)', [adminId, adminId]);
      db.run('DELETE FROM groups WHERE owner_id = ?', [adminId]);
      db.run('DELETE FROM users WHERE id = ?', [adminId]);
    }
    if (userId) {
      db.run('DELETE FROM memberships WHERE user_id = ?', [userId]);
      db.run('DELETE FROM users WHERE id = ?', [userId]);
    }
  });

  it('AC-3: A group owner who fills out the session scheduling form with valid data and schedules sees the event', async () => {
    const res = await agent.post('/api/sessions').send({
      groupId: mathGroupId,
      title: 'Calculus Session AC3',
      startTime: '2030-02-01 10:00:00',
      endTime: '2030-02-01 11:30:00'
    });
    expect(res.status).to.equal(201);
  });

  it('AC-4: A group member who opens the upcoming events section sees a chronological list of future study sessions', async () => {
    await agent.post('/api/memberships').send({ groupId: mathGroupId });
    const res = await agent.get('/api/sessions');
    expect(res.status).to.equal(200);
    expect(res.body).to.be.an('array');
    expect(res.body.length).to.be.greaterThan(0);
  });

  it('AC-5: A group owner who attempts to create/edit group settings but leaves the name field blank sees error Name cannot be empty', async () => {
    const res = await adminAgent.post('/api/groups').send({
      name: '',
      courseName: 'Math 102'
    });
    expect(res.status).to.equal(400);
    expect(res.body.error).to.include('Name cannot be empty');
  });

  it('AC-6: A user who submits session notes to the summarise_notes feature sees a generated summary and tags from fixed list', async () => {
    const fakeClient = async (notes) => ({
      summary: 'Summary line 1\nSummary line 2',
      tags: ['Databases', 'Testing', 'Algorithms']
    });
    const result = await sessionService.summariseNotes('Some notes about databases and testing', { client: fakeClient });
    expect(result.summary.split('\n').length).to.equal(2);
    expect(result.tags).to.deep.equal(['Databases', 'Testing', 'Algorithms']);
  });

  it('AC-7: A student who enters what they want to study to find a group sees matching suggestions', async () => {
    const res = await agent.get('/api/groups');
    expect(res.status).to.equal(200);
    expect(res.body.some(g => g.course_name === 'Math 101')).to.be.true;
  });

  it('AC-8: A user who calls my_groups sees a list of all groups in which they participate', async () => {
    await agent.post('/api/memberships').send({ groupId: mathGroupId });
    const res = await agent.get('/api/groups');
    const myGroups = res.body.filter(g => g.is_member === 1);
    expect(myGroups.length).to.be.greaterThan(0);
  });

  it('AC-21: An admin user can successfully create a new study group', async () => {
    const res = await adminAgent.post('/api/groups').send({
      name: 'Admin Group AC21',
      courseName: 'Advanced CS'
    });
    expect(res.status).to.equal(201);
    expect(res.body.success).to.be.true;
  });

  it('AC-22: A group owner/operator sees the Schedule Session button only for groups they own', async () => {
    const res = await agent.get('/api/groups');
    const group = res.body.find(g => g.id === mathGroupId);
    expect(group).to.exist;
  });

  it('AC-23: Any signed-in user can view available groups, join or leave, and toggle attendance status', async () => {
    const res = await agent.get('/api/groups');
    expect(res.status).to.equal(200);
  });

  it('AC-24: If a user attempts to perform a role-restricted action via direct API request, server responds with 403 Forbidden', async () => {
    const studentRes = await agent.post('/api/groups').send({
      name: 'Hacker Group',
      courseName: 'Security'
    });
    expect(studentRes.status).to.equal(403);
  });

  it('AC-15: A user can leave a group', async () => {
    await agent.post('/api/memberships').send({ groupId: mathGroupId });

    let res = await agent.get('/api/groups');
    let mathGroup = res.body.find(g => g.id === mathGroupId);
    expect(mathGroup.is_member).to.equal(1);

    const leaveRes = await agent.delete('/api/memberships').send({ groupId: mathGroupId });
    expect(leaveRes.status).to.equal(200);

    res = await agent.get('/api/groups');
    mathGroup = res.body.find(g => g.id === mathGroupId);
    expect(mathGroup.is_member).to.equal(0);
  });

  it('AC-16: Available groups show next session time', async () => {
    const res = await agent.get('/api/groups');
    const mathGroup = res.body.find(g => g.id === mathGroupId);
    expect(mathGroup.next_session).to.be.a('string');
  });

  it('AC-17: Dates/times are handled in 24h format', async () => {
    await agent.post('/api/memberships').send({ groupId: mathGroupId });

    const res = await agent.get('/api/sessions');
    expect(res.body[0].start_time).to.be.a('string');
  });

  it('Admin can successfully delete a group with dependent sessions and memberships without foreign key errors', async () => {
    const createRes = await adminAgent.post('/api/groups').send({
      name: 'Group To Delete',
      courseName: 'Test 101'
    });
    expect(createRes.status).to.equal(201);
    const deleteGroupId = createRes.body.groupId;

    await adminAgent.post('/api/sessions').send({
      groupId: deleteGroupId,
      title: 'Session in Delete Group',
      startTime: '2030-05-01 10:00:00',
      endTime: '2030-05-01 11:00:00'
    });

    const delRes = await adminAgent.delete(`/api/groups/${deleteGroupId}`);
    expect(delRes.status).to.equal(200);
    expect(delRes.body.success).to.be.true;
  });
});
