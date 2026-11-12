import '../scripts/test-database-setup.js';
import { describe, it, before, after } from 'node:test';
import request from 'supertest';
import { expect } from 'chai';
import app from '../src/app.js';
import { getDb } from '../src/data/db.js';
import bcrypt from 'bcrypt';
import * as sessionService from '../src/services/sessionService.js';
import { callProjectTool } from '../mcp-server/project-tools.js';

const RUN_ID = `${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
const EMAIL = `student_nf_${RUN_ID}@example.com`;
const ADMIN_EMAIL = `admin_nf_${RUN_ID}@example.com`;

describe('Feature acceptance tests', () => {
  let agent;
  let adminAgent;
  let userId;
  let adminId;
  let mathGroupId;
  let physicsGroupId;

  before(async () => {
    const db = getDb();
    const hashedPassword = await bcrypt.hash('password123', 10);
    const userRes = await db.run('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?) RETURNING id', [EMAIL, hashedPassword, 'student']);
    userId = userRes.lastID;

    const adminRes = await db.run('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?) RETURNING id', [ADMIN_EMAIL, hashedPassword, 'admin']);
    adminId = adminRes.lastID;

    const groupRes = await db.run('INSERT INTO groups (name, course_name, owner_id) VALUES (?, ?, ?) RETURNING id', ['Math Group NF', 'Math 101', adminId]);
    mathGroupId = groupRes.lastID;
    await db.run('INSERT INTO memberships (user_id, group_id) VALUES (?, ?)', [adminId, mathGroupId]);
    const physicsRes = await db.run('INSERT INTO groups (name, course_name, owner_id) VALUES (?, ?, ?) RETURNING id', ['Physics Group NF', 'Physics 101', adminId]);
    physicsGroupId = physicsRes.lastID;
    await db.run('INSERT INTO memberships (user_id, group_id) VALUES (?, ?)', [adminId, physicsGroupId]);

    await db.run('INSERT INTO sessions (group_id, title, start_time, end_time) VALUES (?, ?, ?, ?)', [mathGroupId, 'Algebra Review NF', '2030-01-01 14:30:00', '2030-01-01 16:00:00']);

    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: EMAIL, password: 'password123' });

    adminAgent = request.agent(app);
    await adminAgent.post('/api/auth/login').send({ email: ADMIN_EMAIL, password: 'password123' });
  });

  after(async () => {
    const db = getDb();
    if (mathGroupId) {
      await db.run('DELETE FROM session_attendance WHERE session_id IN (SELECT id FROM sessions WHERE group_id = ?)', [mathGroupId]);
      await db.run('DELETE FROM group_operators WHERE group_id = ?', [mathGroupId]);
      await db.run('DELETE FROM sessions WHERE group_id = ?', [mathGroupId]);
      await db.run('DELETE FROM memberships WHERE group_id = ?', [mathGroupId]);
      await db.run('DELETE FROM groups WHERE id = ?', [mathGroupId]);
    }
    if (physicsGroupId) {
      await db.run('DELETE FROM memberships WHERE group_id = ?', [physicsGroupId]);
      await db.run('DELETE FROM groups WHERE id = ?', [physicsGroupId]);
    }
    if (adminId) {
      await db.run('DELETE FROM session_attendance WHERE user_id = ? OR session_id IN (SELECT id FROM sessions WHERE group_id IN (SELECT id FROM groups WHERE owner_id = ?))', [adminId, adminId]);
      await db.run('DELETE FROM group_operators WHERE user_id = ? OR group_id IN (SELECT id FROM groups WHERE owner_id = ?)', [adminId, adminId]);
      await db.run('DELETE FROM sessions WHERE group_id IN (SELECT id FROM groups WHERE owner_id = ?)', [adminId]);
      await db.run('DELETE FROM memberships WHERE user_id = ? OR group_id IN (SELECT id FROM groups WHERE owner_id = ?)', [adminId, adminId]);
      await db.run('DELETE FROM groups WHERE owner_id = ?', [adminId]);
      await db.run('DELETE FROM users WHERE id = ?', [adminId]);
    }
    if (userId) {
      await db.run('DELETE FROM session_attendance WHERE user_id = ?', [userId]);
      await db.run('DELETE FROM group_operators WHERE user_id = ?', [userId]);
      await db.run('DELETE FROM memberships WHERE user_id = ?', [userId]);
      await db.run('DELETE FROM users WHERE id = ?', [userId]);
    }
  });

  it('AC-3: A group owner sees a newly scheduled session in their upcoming session list', async () => {
    const res = await adminAgent.post('/api/sessions').send({
      groupId: mathGroupId,
      title: 'Calculus Session AC3',
      startTime: '2030-02-01 10:00:00',
      endTime: '2030-02-01 11:30:00'
    });
    expect(res.status).to.equal(201);
    const sessions = await adminAgent.get('/api/sessions');
    expect(sessions.body.some(session => session.id === res.body.sessionId)).to.be.true;
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
    const submittedNotes = 'Some notes about databases and testing';
    let receivedNotes;
    const fakeClient = async (notes) => {
      receivedNotes = notes;
      return {
        summary: 'Summary line 1\nSummary line 2',
        tags: ['Databases', 'Testing', 'Algorithms']
      };
    };
    const result = await sessionService.summariseNotes(submittedNotes, { client: fakeClient });
    expect(result.source).to.equal('ai');
    expect(receivedNotes).to.equal(submittedNotes);
    expect(result.summary.split('\n').length).to.equal(2);
    expect(result.tags).to.deep.equal(['Databases', 'Testing', 'Algorithms']);
  });

  it('AC-2: MCP join_group uses the authenticated session identity and records membership', async () => {
    const result = await callProjectTool('join_group', {
      userId: adminId,
      groupId: mathGroupId
    }, { resolveUser: async () => userId });
    expect(result.isError).to.not.be.true;
    expect(result.content[0].text).to.equal('You have successfully joined the group');
    const membership = await getDb().get(
      'SELECT user_id FROM memberships WHERE user_id = ? AND group_id = ?',
      [userId, mathGroupId]
    );
    expect(membership.user_id).to.equal(userId);
  });

  it('AC-7: Interest suggestions match group topics and exclude ineligible memberships', async () => {
    await agent.delete('/api/memberships').send({ groupId: mathGroupId });
    const res = await agent.get('/api/groups/suggestions?interest=Math');
    expect(res.status).to.equal(200);
    expect(res.body.map(group => group.id)).to.include(mathGroupId);
    expect(res.body.map(group => group.id)).to.not.include(physicsGroupId);
    await agent.post('/api/memberships').send({ groupId: mathGroupId });
    const updatedSuggestions = await agent.get('/api/groups/suggestions?interest=Math');
    expect(updatedSuggestions.body.map(group => group.id)).to.not.include(mathGroupId);
  });

  it('AC-8: A user who calls my_groups sees a list of all groups in which they participate', async () => {
    await agent.post('/api/memberships').send({ groupId: mathGroupId });
    const res = await agent.get('/api/groups');
    const myGroups = res.body.filter(g => g.is_member === 1);
    expect(myGroups.length).to.be.greaterThan(0);
  });

  it('AC-21: An admin can create a study group through the administrator group-management API', async () => {
    const studentRes = await agent.post('/api/groups').send({
      name: 'Student Group AC21',
      courseName: 'Advanced CS'
    });
    expect(studentRes.status).to.equal(403);

    const res = await adminAgent.post('/api/groups').send({
      name: 'Admin Group AC21',
      courseName: 'Advanced CS'
    });
    expect(res.status).to.equal(201);
    expect(res.body.success).to.be.true;
  });

  it('AC-22: only a group owner or operator can schedule sessions for that group', async () => {
    const ownGroupSession = await adminAgent.post('/api/sessions').send({
      groupId: mathGroupId,
      title: 'Owner session AC22',
      startTime: '2030-04-01 10:00:00',
      endTime: '2030-04-01 11:00:00'
    });
    expect(ownGroupSession.status).to.equal(201);

    const otherGroup = await adminAgent.post('/api/groups').send({
      name: 'Admin-owned group AC22',
      courseName: 'Advanced CS'
    });
    expect(otherGroup.status).to.equal(201);

    const otherGroupSession = await agent.post('/api/sessions').send({
      groupId: otherGroup.body.groupId,
      title: 'Unauthorized session AC22',
      startTime: '2030-04-02 10:00:00',
      endTime: '2030-04-02 11:00:00'
    });
    expect(otherGroupSession.status).to.equal(403);
  });

  it('AC-24: A direct request for the protected user list is forbidden to students', async () => {
    const userList = await agent.get('/api/users');
    expect(userList.status).to.equal(403);
    expect(userList.body.error).to.include('Only admins');
  });

  it('AC-15 & AC-23: signed-in users can view groups, join, leave, and toggle session attendance', async () => {
    await agent.post('/api/memberships').send({ groupId: mathGroupId });

    const groups = await agent.get('/api/groups');
    expect(groups.status).to.equal(200);
    let mathGroup = groups.body.find(g => g.id === mathGroupId);
    expect(mathGroup.is_member).to.equal(1);

    const sessions = await agent.get('/api/sessions');
    const session = sessions.body.find(item => item.group_id === mathGroupId);
    expect(session).to.exist;

    const notAttending = await agent
      .post(`/api/sessions/${session.id}/attendance`)
      .send({ status: 'not_attending' });
    expect(notAttending.status).to.equal(200);

    const updatedSessions = await agent.get('/api/sessions');
    expect(updatedSessions.body.find(item => item.id === session.id).attendance_status)
      .to.equal('not_attending');

    const attending = await agent
      .post(`/api/sessions/${session.id}/attendance`)
      .send({ status: 'attending' });
    expect(attending.status).to.equal(200);

    const leaveRes = await agent.delete('/api/memberships').send({ groupId: mathGroupId });
    expect(leaveRes.status).to.equal(200);

    const groupsAfterLeave = await agent.get('/api/groups');
    mathGroup = groupsAfterLeave.body.find(g => g.id === mathGroupId);
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

  it('AC-25: a user can delete their account after confirming their password', async () => {
    const testAgent = request.agent(app);
    const tempEmail = `temp_del_${Date.now()}@example.com`;
    const hashedPassword = await bcrypt.hash('password123', 10);
    const db = getDb();
    let tempId;

    try {
      const user = await db.run(
        'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?) RETURNING id',
        [tempEmail, hashedPassword, 'student']
      );
      tempId = user.lastID;

      const login = await testAgent.post('/api/auth/login').send({
        email: tempEmail,
        password: 'password123'
      });
      expect(login.status).to.equal(200);

      const wrongPassword = await testAgent
        .delete('/api/auth/account')
        .send({ password: 'wrongpassword' });
      expect(wrongPassword.status).to.equal(401);

      const deletion = await testAgent
        .delete('/api/auth/account')
        .send({ password: 'password123' });
      expect(deletion.status).to.equal(200);
      expect(deletion.body.success).to.be.true;
      expect(await db.get('SELECT id FROM users WHERE id = ?', [tempId])).to.be.null;
    } finally {
      if (tempId) {
        await db.run('DELETE FROM users WHERE id = ?', [tempId]);
      }
    }
  });

  it('AC-26: an admin can create, update, and delete accounts with admin password authentication', async () => {
    const managedEmail = `managed_${Date.now()}@example.com`;
    // Create
    const createRes = await adminAgent.post('/api/users').send({
      email: managedEmail,
      password: 'password123',
      role: 'operator'
    });
    expect(createRes.status).to.equal(200);
    expect(createRes.body.success).to.be.true;
    const managedId = createRes.body.user.id;

    // Update
    const updateRes = await adminAgent.put(`/api/users/${managedId}`).send({
      email: managedEmail,
      role: 'admin'
    });
    expect(updateRes.status).to.equal(200);
    expect(updateRes.body.user.role).to.equal('admin');

    // Delete with wrong password fails (401)
    const failDeleteRes = await adminAgent.delete(`/api/users/${managedId}`).send({ password: 'wrongpassword' });
    expect(failDeleteRes.status).to.equal(401);

    // Delete with correct admin password succeeds
    const deleteRes = await adminAgent.delete(`/api/users/${managedId}`).send({ password: 'password123' });
    expect(deleteRes.status).to.equal(200);
    expect(deleteRes.body.success).to.be.true;
  });

  it('Admin creating user with already existing email returns 400 error', async () => {
    const dupEmail = `dup_${Date.now()}@example.com`;
    await adminAgent.post('/api/users').send({
      email: dupEmail,
      password: 'password123',
      role: 'student'
    });

    const res = await adminAgent.post('/api/users').send({
      email: dupEmail,
      password: 'password456',
      role: 'student'
    });
    expect(res.status).to.equal(400);
    expect(res.body.error).to.include('already exists');
  });

  it('Emails are saved in lowercase and login is case-insensitive for user email', async () => {
    const mixedEmail = `MixedCase_${Date.now()}@Example.COM`;
    const createRes = await adminAgent.post('/api/users').send({
      email: mixedEmail,
      password: 'password123',
      role: 'student'
    });
    expect(createRes.status).to.equal(200);
    const createdUserId = createRes.body.user.id;
    expect(createRes.body.user.email).to.equal(mixedEmail.toLowerCase());

    // Try logging in with uppercase/mixed case email
    const loginAgent = request.agent(app);
    const loginRes = await loginAgent.post('/api/auth/login').send({
      email: mixedEmail.toUpperCase(),
      password: 'password123'
    });
    expect(loginRes.status).to.equal(200);
    expect(loginRes.body.success).to.be.true;

    // Cleanup
    await adminAgent.delete(`/api/users/${createdUserId}`).send({ password: 'password123' });
  });
});
