import { describe, it, before, after } from 'node:test';
import { expect } from 'chai';
import * as authService from '../src/services/authService.js';
import * as sessionService from '../src/services/sessionService.js';
import * as userRepo from '../src/data/userRepo.js';
import { getDb } from '../src/data/db.js';
import bcrypt from 'bcrypt';

const RUN_ID = `${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
const EMAIL_AUTH = `auth_test_${RUN_ID}@example.com`;
const EMAIL_ADMIN = `admin_test_${RUN_ID}@example.com`;
const EMAIL_STUDENT = `student_test_${RUN_ID}@example.com`;
const EMAIL_NEW = `new_user_${RUN_ID}@example.com`;

describe('Service layer tests', () => {
  let userId;
  let adminId;
  let studentId;
  let groupId;
  let sessionId;

  before(async () => {
    const db = getDb();
    const hash = await bcrypt.hash('password123', 10);
    const uRes = await db.run('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?) RETURNING id', [EMAIL_AUTH, hash, 'student']);
    userId = uRes.lastID;

    const aRes = await db.run('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?) RETURNING id', [EMAIL_ADMIN, hash, 'admin']);
    adminId = aRes.lastID;

    const sRes = await db.run('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?) RETURNING id', [EMAIL_STUDENT, hash, 'student']);
    studentId = sRes.lastID;

    const gRes = await db.run('INSERT INTO groups (name, course_name, owner_id) VALUES (?, ?, ?) RETURNING id', ['Service Group', 'Service 101', adminId]);
    groupId = gRes.lastID;

    await db.run('INSERT INTO group_operators (group_id, user_id) VALUES (?, ?)', [groupId, adminId]);

    const sessRes = await db.run('INSERT INTO sessions (group_id, title, start_time, end_time) VALUES (?, ?, ?, ?) RETURNING id', [groupId, 'Service Session', '2030-01-01 10:00:00', '2030-01-01 11:00:00']);
    sessionId = sessRes.lastID;
  });

  after(async () => {
    const db = getDb();
    if (groupId) {
      await db.run('DELETE FROM session_attendance WHERE session_id IN (SELECT id FROM sessions WHERE group_id = ?)', [groupId]);
      await db.run('DELETE FROM group_operators WHERE group_id = ?', [groupId]);
      await db.run('DELETE FROM sessions WHERE group_id = ?', [groupId]);
      await db.run('DELETE FROM memberships WHERE group_id = ?', [groupId]);
      await db.run('DELETE FROM groups WHERE id = ?', [groupId]);
    }
    const ids = [userId, adminId, studentId].filter(Boolean);
    for (const id of ids) {
      await db.run('DELETE FROM session_attendance WHERE user_id = ? OR session_id IN (SELECT id FROM sessions WHERE group_id IN (SELECT id FROM groups WHERE owner_id = ?))', [id, id]);
      await db.run('DELETE FROM group_operators WHERE user_id = ? OR group_id IN (SELECT id FROM groups WHERE owner_id = ?)', [id, id]);
      await db.run('DELETE FROM sessions WHERE group_id IN (SELECT id FROM groups WHERE owner_id = ?)', [id]);
      await db.run('DELETE FROM memberships WHERE user_id = ? OR group_id IN (SELECT id FROM groups WHERE owner_id = ?)', [id, id]);
      await db.run('DELETE FROM groups WHERE owner_id = ?', [id]);
      await db.run('DELETE FROM users WHERE id = ?', [id]);
    }
  });

  it('authService: authenticateUser handles missing user, wrong password, and success', async () => {
    const resNull = await authService.authenticateUser(null, 'password123');
    expect(resNull).to.be.null;

    const resMissing = await authService.authenticateUser('nonexistent@example.com', 'password123');
    expect(resMissing).to.be.null;

    const resWrong = await authService.authenticateUser(EMAIL_AUTH, 'wrongpassword');
    expect(resWrong).to.be.null;

    const resSuccess = await authService.authenticateUser(EMAIL_AUTH, 'password123');
    expect(resSuccess).to.have.property('id', userId);
  });

  it('authService: deleteAccount handles user not found, wrong password, and success', async () => {
    try {
      await authService.deleteAccount(999999, 'password123');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).to.equal(404);
    }

    try {
      await authService.deleteAccount(userId, 'wrongpassword');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).to.equal(401);
    }

    const resDel = await authService.deleteAccount(userId, 'password123');
    expect(resDel.success).to.be.true;
  });

  it('sessionService: checkHealth works', async () => {
    const healthy = await sessionService.checkHealth();
    expect(healthy).to.be.true;
  });

  it('sessionService: getUpcomingSessions, getAllGroups, joinGroup, leaveGroup, updateSessionAttendance', async () => {
    const up = await sessionService.getUpcomingSessions(adminId);
    expect(up).to.be.an('array');

    const groups = await sessionService.getAllGroups(adminId);
    expect(groups).to.be.an('array');

    await sessionService.joinGroup(adminId, groupId);
    await sessionService.updateSessionAttendance(adminId, sessionId, 'attending');
    await sessionService.leaveGroup(adminId, groupId);
  });

  it('sessionService: createGroup validations and success', async () => {
    try {
      await sessionService.createGroup(studentId, { name: '', courseName: 'CS' });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).to.equal(400);
    }

    try {
      await sessionService.createGroup(adminId, { name: 'New G', courseName: '' });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).to.equal(400);
    }

    try {
      await sessionService.createGroup(studentId, { name: 'New G', courseName: 'CS' });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).to.equal(403);
    }

    const created = await sessionService.createGroup(adminId, { name: 'Admin Created Group', courseName: 'Advanced' });
    expect(created).to.be.a('number');
  });

  it('sessionService: scheduleSession validation, authorization, and conflict', async () => {
    try {
      await sessionService.scheduleSession(adminId, { groupId: 0, title: '', startTime: '', endTime: '' });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).to.equal(400);
    }

    try {
      await sessionService.scheduleSession(adminId, { groupId, title: '', startTime: '2030-01-01 10:00:00', endTime: '2030-01-01 11:00:00' });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).to.equal(400);
    }

    try {
      await sessionService.scheduleSession(adminId, { groupId, title: 'T', startTime: '', endTime: '2030-01-01 11:00:00' });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).to.equal(400);
    }

    try {
      await sessionService.scheduleSession(adminId, { groupId, title: 'T', startTime: '2030-01-01 10:00:00', endTime: '' });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).to.equal(400);
    }

    try {
      await sessionService.scheduleSession(adminId, { groupId, title: 'T', startTime: '2030-01-02 12:00:00', endTime: '2030-01-01 12:00:00' });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).to.equal(400);
    }

    try {
      await sessionService.scheduleSession(999999, { groupId, title: 'T', startTime: '2030-01-01 10:00:00', endTime: '2030-01-01 11:00:00' });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).to.equal(401);
    }

    try {
      await sessionService.scheduleSession(adminId, { groupId: 999999, title: 'T', startTime: '2030-01-01 10:00:00', endTime: '2030-01-01 11:00:00' });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).to.equal(404);
    }

    try {
      await sessionService.scheduleSession(studentId, { groupId, title: 'T', startTime: '2030-01-03 10:00:00', endTime: '2030-01-03 11:00:00' });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).to.equal(403);
    }

    try {
      await sessionService.scheduleSession(adminId, { groupId, title: 'Conflict Sess', startTime: '2030-01-01 10:30:00', endTime: '2030-01-01 11:30:00' });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).to.equal(409);
    }

    const sched = await sessionService.scheduleSession(adminId, { groupId, title: 'Non-conflict', startTime: '2030-01-02 10:00:00', endTime: '2030-01-02 11:00:00' });
    expect(sched).to.be.a('number');
  });

  it('sessionService: deleteSession and deleteGroup', async () => {
    try {
      await sessionService.deleteSession(999999, sessionId);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).to.equal(401);
    }

    try {
      await sessionService.deleteSession(adminId, 999999);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).to.equal(404);
    }

    try {
      await sessionService.deleteSession(studentId, sessionId);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).to.equal(403);
    }

    try {
      await sessionService.deleteGroup(studentId, groupId);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).to.equal(403);
    }

    try {
      await sessionService.deleteGroup(adminId, 999999);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).to.equal(404);
    }

    const delSessId = await sessionService.scheduleSession(adminId, { groupId, title: 'Del Sess', startTime: '2030-01-05 10:00:00', endTime: '2030-01-05 11:00:00' });
    await sessionService.deleteSession(adminId, delSessId);
  });

  it('sessionService: assignGroupOperators and getOperatorsForGroup', async () => {
    try {
      await sessionService.assignGroupOperators(studentId, groupId, [adminId]);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).to.equal(403);
    }

    try {
      await sessionService.assignGroupOperators(adminId, 999999, [adminId]);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).to.equal(404);
    }

    await sessionService.assignGroupOperators(adminId, groupId, [adminId, studentId]);
    const ops = await sessionService.getOperatorsForGroup(groupId);
    expect(ops).to.be.an('array');
  });

  it('sessionService: user management functions (getAllUsers, adminCreateUser, adminUpdateUser, adminDeleteUser)', async () => {
    const users = await sessionService.getAllUsers();
    expect(users).to.be.an('array');

    try {
      await sessionService.adminCreateUser(studentId, { email: EMAIL_NEW, password: 'pw', role: 'student' });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).to.equal(403);
    }

    try {
      await sessionService.adminCreateUser(adminId, { email: '', password: '' });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).to.equal(400);
    }

    const createdU = await sessionService.adminCreateUser(adminId, { email: EMAIL_NEW, password: 'password123', role: 'invalid_role' });
    expect(createdU).to.have.property('id');
    expect(createdU.role).to.equal('student');

    const updatedU2 = await sessionService.adminUpdateUser(adminId, createdU.id, { role: 'bad_role' });
    expect(updatedU2.role).to.equal('student');

    const updatedU3 = await sessionService.adminUpdateUser(adminId, createdU.id, { password: 'newpassonly' });
    expect(updatedU3).to.have.property('id');

    try {
      await sessionService.adminCreateUser(adminId, { email: EMAIL_NEW, password: 'password123', role: 'student' });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).to.equal(400);
    }

    try {
      await sessionService.adminUpdateUser(studentId, createdU.id, { email: 'newmail@example.com', role: 'student' });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).to.equal(403);
    }

    try {
      await sessionService.adminUpdateUser(adminId, 999999, { email: 'newmail@example.com', role: 'student' });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).to.equal(404);
    }

    try {
      await sessionService.adminUpdateUser(adminId, createdU.id, { email: EMAIL_ADMIN, role: 'student' });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).to.equal(400);
    }

    const updatedU = await sessionService.adminUpdateUser(adminId, createdU.id, { email: EMAIL_NEW, password: 'newpass', role: 'operator' });
    expect(updatedU.role).to.equal('operator');

    const updatedU4 = await sessionService.adminUpdateUser(adminId, createdU.id, { email: EMAIL_NEW, role: 'student' });
    expect(updatedU4.role).to.equal('student');

    try {
      await sessionService.adminDeleteUser(studentId, createdU.id, 'password123');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).to.equal(403);
    }

    try {
      await sessionService.adminDeleteUser(adminId, createdU.id, 'wrongadminpass');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).to.equal(401);
    }

    try {
      await sessionService.adminDeleteUser(adminId, 999999, 'password123');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).to.equal(404);
    }

    await sessionService.adminDeleteUser(adminId, createdU.id, 'password123');
  });

  it('sessionService: adminCreateUser and adminUpdateUser error handling catch blocks', async () => {
    try {
      await sessionService.adminCreateUser(adminId, { email: EMAIL_NEW, password: {}, role: 'student' });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).to.equal(400);
      expect(err.message).to.equal('User with this email already exists or invalid email');
    }

    try {
      await sessionService.adminUpdateUser(adminId, adminId, { password: {} });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).to.equal(400);
      expect(err.message).to.equal('User with this email already exists or invalid email');
    }
  });

  it('sessionService: summariseNotes tests API branches and catch/error blocks', async () => {
    process.env.GEMINI_API_KEY = '';
    const res1 = await sessionService.summariseNotes('notes');
    expect(res1).to.have.property('summary');

    const resCustomKey = await sessionService.summariseNotes('notes', { apiKey: 'my-custom-key' });
    expect(resCustomKey).to.have.property('summary');

    const resClientSuccess = await sessionService.summariseNotes('notes', { client: async () => ({ summary: 'client sum', tags: ['Databases'] }) });
    expect(resClientSuccess.summary).to.equal('client sum');

    const res2 = await sessionService.summariseNotes('notes', { client: async () => { throw new Error('fail'); } });
    expect(res2).to.have.property('summary');

    process.env.GEMINI_API_KEY = 'fake-key';
    const originalFetch = global.fetch;

    // Fetch success
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              text: 'Summary line one\nSummary line two\n```json\n{"summary": "Summary line one\\nSummary line two", "tags": ["Databases", "Testing", "JavaScript"]}\n```'
            }]
          }
        }]
      })
    });
    const res3 = await sessionService.summariseNotes('notes');
    expect(res3.tags).to.deep.equal(['Databases', 'Testing', 'JavaScript']);

    // Fetch non-ok
    global.fetch = async () => ({ ok: false });
    const res4 = await sessionService.summariseNotes('notes');
    expect(res4).to.have.property('summary');

    // Fetch throws network error / abort
    global.fetch = async () => { throw new Error('Network error'); };
    const res4b = await sessionService.summariseNotes('notes');
    expect(res4b).to.have.property('summary');

    // Fetch invalid JSON text
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{ text: 'invalid json' }]
          }
        }]
      })
    });
    const res5 = await sessionService.summariseNotes('notes');
    expect(res5).to.have.property('summary');

    // Fetch missing text or insufficient tags (e.g. < 3 valid tags)
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{ text: '{"summary": "sum", "tags": ["Databases"]}' }]
          }
        }]
      })
    });
    const res6 = await sessionService.summariseNotes('notes');
    expect(res6).to.have.property('summary');

    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{ text: '{"summary": "sum", "tags": ["Databases", "UnknownTag1", "UnknownTag2"]}' }]
          }
        }]
      })
    });
    const res6c = await sessionService.summariseNotes('notes');
    expect(res6c).to.have.property('summary');

    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{ text: '{"summary": "\\n\\n", "tags": ["Databases", "Algorithms", "Networking"]}' }]
          }
        }]
      })
    });
    const res6d = await sessionService.summariseNotes('notes');
    expect(res6d).to.have.property('summary');

    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{ text: '{"summary": 123, "tags": ["Databases", "Algorithms", "Networking"]}' }]
          }
        }]
      })
    });
    const res6e = await sessionService.summariseNotes('notes');
    expect(res6e).to.have.property('summary');

    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{ text: '{"summary": "sum", "tags": "not-array"}' }]
          }
        }]
      })
    });
    const res6f = await sessionService.summariseNotes('notes');
    expect(res6f).to.have.property('summary');
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{ text: 'null' }]
          }
        }]
      })
    });
    const res6g = await sessionService.summariseNotes('notes');
    expect(res6g).to.have.property('summary');

    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        candidates: []
      })
    });
    const res6h = await sessionService.summariseNotes('notes');
    expect(res6h).to.have.property('summary');

    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{}]
          }
        }]
      })
    });
    const res6i = await sessionService.summariseNotes('notes');
    expect(res6i).to.have.property('summary');

    const res7 = await sessionService.summariseNotes();
    expect(res7).to.have.property('summary');

    const res7b = await sessionService.summariseNotes('');
    expect(res7b).to.have.property('summary');

    const res7c = await sessionService.summariseNotes('Line A\nLine B');
    expect(res7c).to.have.property('summary');

    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{ text: '{"summary": "sum", "tags": null}' }]
          }
        }]
      })
    });
    const res6j = await sessionService.summariseNotes('notes');
    expect(res6j).to.have.property('summary');

    global.fetch = originalFetch;
  });
});
