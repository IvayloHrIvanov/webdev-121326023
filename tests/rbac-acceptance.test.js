import '../scripts/test-database-setup.js';
import { describe, it, before, after } from 'node:test';
import request from 'supertest';
import { expect } from 'chai';
import app from '../src/app.js';
import { getDb } from '../src/data/db.js';
import bcrypt from 'bcrypt';

const RUN_ID = `${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
const ADMIN_EMAIL = `admin_s2_${RUN_ID}@example.com`;
const OWNER_EMAIL = `owner_s2_${RUN_ID}@example.com`;
const STUDENT_EMAIL = `student_s2_${RUN_ID}@example.com`;

describe('Authorization and session scheduling acceptance tests', () => {
  let adminAgent, ownerAgent, studentAgent;
  let adminId, ownerId, studentId;
  let groupId;

  before(async () => {
    const db = getDb();
    const hashedPassword = await bcrypt.hash('password123', 10);

    const adminRes = await db.run('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?) RETURNING id', [ADMIN_EMAIL, hashedPassword, 'admin']);
    adminId = adminRes.lastID;

    const ownerRes = await db.run('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?) RETURNING id', [OWNER_EMAIL, hashedPassword, 'operator']);
    ownerId = ownerRes.lastID;

    const studentRes = await db.run('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?) RETURNING id', [STUDENT_EMAIL, hashedPassword, 'student']);
    studentId = studentRes.lastID;

    const groupRes = await db.run('INSERT INTO groups (name, course_name, owner_id) VALUES (?, ?, ?) RETURNING id', ['Physics Group S2', 'Physics 101', ownerId]);
    groupId = groupRes.lastID;
    await db.run('INSERT INTO memberships (user_id, group_id) VALUES (?, ?)', [ownerId, groupId]);
    await db.run('INSERT INTO memberships (user_id, group_id) VALUES (?, ?)', [studentId, groupId]);

    adminAgent = request.agent(app);
    await adminAgent.post('/api/auth/login').send({ email: ADMIN_EMAIL, password: 'password123' });

    ownerAgent = request.agent(app);
    await ownerAgent.post('/api/auth/login').send({ email: OWNER_EMAIL, password: 'password123' });

    studentAgent = request.agent(app);
    await studentAgent.post('/api/auth/login').send({ email: STUDENT_EMAIL, password: 'password123' });
  });

  after(async () => {
    const db = getDb();
    const userIds = [adminId, ownerId, studentId].filter(Boolean);
    for (const uid of userIds) {
      await db.run('DELETE FROM session_attendance WHERE user_id = ? OR session_id IN (SELECT id FROM sessions WHERE group_id IN (SELECT id FROM groups WHERE owner_id = ?))', [uid, uid]);
      await db.run('DELETE FROM group_operators WHERE user_id = ? OR group_id IN (SELECT id FROM groups WHERE owner_id = ?)', [uid, uid]);
      await db.run('DELETE FROM sessions WHERE group_id IN (SELECT id FROM groups WHERE owner_id = ?)', [uid]);
      await db.run('DELETE FROM memberships WHERE user_id = ? OR group_id IN (SELECT id FROM groups WHERE owner_id = ?)', [uid, uid]);
      await db.run('DELETE FROM groups WHERE owner_id = ?', [uid]);
      await db.run('DELETE FROM users WHERE id = ?', [uid]);
    }
  });

  it('AC-1: An administrator who creates a group is recorded as its owner and member', async () => {
    const adminRes = await adminAgent.post('/api/groups').send({ name: 'Admin Group S2', courseName: 'Math101' });
    expect(adminRes.status).to.equal(201);
    expect(adminRes.body.success).to.be.true;
    const group = await getDb().get('SELECT owner_id FROM groups WHERE id = ?', [adminRes.body.groupId]);
    const membership = await getDb().get(
      'SELECT user_id FROM memberships WHERE user_id = ? AND group_id = ?',
      [adminId, adminRes.body.groupId]
    );
    expect(group.owner_id).to.equal(adminId);
    expect(membership.user_id).to.equal(adminId);
  });

  it('optional group passwords are hashed and required only when joining or rejoining protected groups', async () => {
    const freeGroup = await adminAgent.post('/api/groups').send({
      name: 'Open Group S2',
      courseName: 'Open Studies'
    });
    expect(freeGroup.status).to.equal(201);
    const groups = await studentAgent.get('/api/groups');
    expect(groups.body.find(group => group.id === freeGroup.body.groupId).is_password_protected).to.be.false;
    const freeJoin = await studentAgent.post('/api/memberships').send({ groupId: freeGroup.body.groupId });
    expect(freeJoin.status).to.equal(200);

    const protectedGroup = await adminAgent.post('/api/groups').send({
      name: 'Protected Group S2',
      courseName: 'Private Studies',
      password: 'study-secret'
    });
    expect(protectedGroup.status).to.equal(201);
    const invalidPasswordGroup = await adminAgent.post('/api/groups').send({
      name: 'Invalid Password Group S2',
      courseName: 'Private Studies',
      password: 123
    });
    expect(invalidPasswordGroup.status).to.equal(400);
    const storedGroup = await getDb().get('SELECT password_hash FROM groups WHERE id = ?', [protectedGroup.body.groupId]);
    expect(storedGroup.password_hash).not.to.equal('study-secret');
    expect(await bcrypt.compare('study-secret', storedGroup.password_hash)).to.be.true;
    const listedGroup = (await studentAgent.get('/api/groups')).body.find(group => group.id === protectedGroup.body.groupId);
    expect(listedGroup.is_password_protected).to.be.true;
    expect(listedGroup).not.to.have.property('password_hash');

    const missingPassword = await studentAgent.post('/api/memberships').send({ groupId: protectedGroup.body.groupId });
    expect(missingPassword.status).to.equal(409);
    expect(missingPassword.body.code).to.equal('PASSWORD_REQUIRED');
    const emptyPassword = await studentAgent.post('/api/memberships').send({
      groupId: protectedGroup.body.groupId,
      password: ''
    });
    expect(emptyPassword.status).to.equal(409);
    expect(emptyPassword.body.code).to.equal('PASSWORD_REQUIRED');
    const wrongPassword = await studentAgent.post('/api/memberships').send({
      groupId: protectedGroup.body.groupId,
      password: 'wrong'
    });
    expect(wrongPassword.status).to.equal(409);
    expect(wrongPassword.body.error).to.include('Incorrect');
    expect(await getDb().get('SELECT 1 FROM memberships WHERE user_id = ? AND group_id = ?', [studentId, protectedGroup.body.groupId])).to.be.null;

    const joined = await studentAgent.post('/api/memberships').send({
      groupId: protectedGroup.body.groupId,
      password: 'study-secret'
    });
    expect(joined.status).to.equal(200);
    const repeatedJoin = await studentAgent.post('/api/memberships').send({ groupId: protectedGroup.body.groupId });
    expect(repeatedJoin.status).to.equal(200);

    await studentAgent.delete('/api/memberships').send({ groupId: protectedGroup.body.groupId });
    const wrongRejoin = await studentAgent.post('/api/memberships').send({
      groupId: protectedGroup.body.groupId,
      password: 'wrong'
    });
    expect(wrongRejoin.status).to.equal(409);
    const rejoined = await studentAgent.post('/api/memberships').send({
      groupId: protectedGroup.body.groupId,
      password: 'study-secret'
    });
    expect(rejoined.status).to.equal(200);
  });

  it('AC-18: A group owner receives success and the session is persisted', async () => {
    const res = await ownerAgent.post('/api/sessions').send({
      groupId,
      title: 'Quantum Mechanics',
      startTime: '2030-07-01 10:00:00',
      endTime: '2030-07-01 11:30:00'
    });
    expect(res.status).to.equal(201);
    expect(res.body.success).to.be.true;
    const storedSession = await getDb().get(
      'SELECT group_id, title FROM sessions WHERE id = ?',
      [res.body.sessionId]
    );
    expect(storedSession).to.deep.equal({ group_id: groupId, title: 'Quantum Mechanics' });
  });

  it('AC-19: A group owner who attempts to schedule an overlapping session is refused with 409 conflict and conflicting session name', async () => {
    const res = await ownerAgent.post('/api/sessions').send({
      groupId,
      title: 'Conflicting Quantum Session',
      startTime: '2030-07-01 10:30:00',
      endTime: '2030-07-01 12:00:00'
    });
    expect(res.status).to.equal(409);
    expect(res.body.error).to.include('Quantum Mechanics');
  });

  it('AC-20: a non-owner receives 403 when scheduling or cancelling another group session', async () => {
    const res = await studentAgent.post('/api/sessions').send({
      groupId,
      title: 'Student Unauthorized Session',
      startTime: '2030-07-02 10:00:00',
      endTime: '2030-07-02 11:30:00'
    });
    expect(res.status).to.equal(403);

    const ownerSession = await ownerAgent.post('/api/sessions').send({
      groupId,
      title: 'Owner session for AC20 cancellation',
      startTime: '2030-07-02 10:00:00',
      endTime: '2030-07-02 11:30:00'
    });
    expect(ownerSession.status).to.equal(201);

    const cancellation = await studentAgent.delete(`/api/sessions/${ownerSession.body.sessionId}`);
    expect(cancellation.status).to.equal(403);
  });
});
