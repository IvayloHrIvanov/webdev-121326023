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

  it('AC-1: An admin can create a new study group, becoming owner, while non-admin is forbidden (403)', async () => {
    const studentRes = await studentAgent.post('/api/groups').send({ name: 'Student Group S2', courseName: 'CS101' });
    expect(studentRes.status).to.equal(403);

    const adminRes = await adminAgent.post('/api/groups').send({ name: 'Admin Group S2', courseName: 'Math101' });
    expect(adminRes.status).to.equal(201);
    expect(adminRes.body.success).to.be.true;
  });

  it('AC-18: A group owner who submits valid session details sees the new session created successfully', async () => {
    const res = await ownerAgent.post('/api/sessions').send({
      groupId,
      title: 'Quantum Mechanics',
      startTime: '2030-07-01 10:00:00',
      endTime: '2030-07-01 11:30:00'
    });
    expect(res.status).to.equal(201);
    expect(res.body.success).to.be.true;
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
