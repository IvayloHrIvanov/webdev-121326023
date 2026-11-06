import { describe, it, before } from 'node:test';
import request from 'supertest';
import { expect } from 'chai';
import app from '../src/app.js';
import { getDb } from '../src/data/db.js';
import bcrypt from 'bcrypt';

describe('Slice 2 Acceptance Tests (RBAC & Session Scheduling)', () => {
  let adminAgent, ownerAgent, studentAgent;
  let adminId, ownerId, studentId;
  let groupId;

  before(async () => {
    const db = getDb();
    db.run('DELETE FROM session_attendance');
    db.run('DELETE FROM sessions');
    db.run('DELETE FROM memberships');
    db.run('DELETE FROM groups');
    db.run('DELETE FROM users');

    const hashedPassword = await bcrypt.hash('password123', 10);

    const adminRes = db.run('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)', ['admin@example.com', hashedPassword, 'admin']);
    adminId = adminRes.lastID;

    const ownerRes = db.run('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)', ['owner@example.com', hashedPassword, 'operator']);
    ownerId = ownerRes.lastID;

    const studentRes = db.run('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)', ['student@example.com', hashedPassword, 'student']);
    studentId = studentRes.lastID;

    // Create group owned by owner
    const groupRes = db.run('INSERT INTO groups (name, course_name, owner_id) VALUES (?, ?, ?)', ['Physics Group', 'Physics 101', ownerId]);
    groupId = groupRes.lastID;
    db.run('INSERT INTO memberships (user_id, group_id) VALUES (?, ?)', [ownerId, groupId]);
    db.run('INSERT INTO memberships (user_id, group_id) VALUES (?, ?)', [studentId, groupId]);

    adminAgent = request.agent(app);
    await adminAgent.post('/api/auth/login').send({ email: 'admin@example.com', password: 'password123' });

    ownerAgent = request.agent(app);
    await ownerAgent.post('/api/auth/login').send({ email: 'owner@example.com', password: 'password123' });

    studentAgent = request.agent(app);
    await studentAgent.post('/api/auth/login').send({ email: 'student@example.com', password: 'password123' });
  });

  it('AC-1: An admin can create a new study group, becoming owner, while non-admin is forbidden (403)', async () => {
    // Student attempts to create group -> 403
    const studentRes = await studentAgent.post('/api/groups').send({ name: 'Student Group', courseName: 'CS101' });
    expect(studentRes.status).to.equal(403);

    // Admin creates group -> 201
    const adminRes = await adminAgent.post('/api/groups').send({ name: 'Admin Study Group', courseName: 'Math 202' });
    expect(adminRes.status).to.equal(201);
    expect(adminRes.body.success).to.be.true;
    expect(adminRes.body.groupId).to.be.a('number');
  });

  it('AC-18: A group owner who submits valid session details sees the new session created successfully', async () => {
    const res = await ownerAgent.post('/api/sessions').send({
      groupId: groupId,
      title: 'Quantum Mechanics Intro',
      startTime: '2030-06-01 10:00:00',
      endTime: '2030-06-01 11:30:00'
    });

    expect(res.status).to.equal(201);
    expect(res.body.success).to.be.true;
    expect(res.body.sessionId).to.be.a('number');
  });

  it('AC-19: A group owner who attempts to schedule an overlapping session is refused with 409 conflict and conflicting session name', async () => {
    const res = await ownerAgent.post('/api/sessions').send({
      groupId: groupId,
      title: 'Overlapping Session',
      startTime: '2030-06-01 11:00:00', // overlaps with 10:00 - 11:30
      endTime: '2030-06-01 12:00:00'
    });

    expect(res.status).to.equal(409);
    expect(res.body.error).to.include('Quantum Mechanics Intro');
  });

  it('AC-20: A user who is not the group owner (student) receives a 403 forbidden response when attempting to schedule a session', async () => {
    const res = await studentAgent.post('/api/sessions').send({
      groupId: groupId,
      title: 'Unauthorized Session',
      startTime: '2030-06-02 10:00:00',
      endTime: '2030-06-02 11:00:00'
    });

    expect(res.status).to.equal(403);
  });
});
