import '../scripts/test-database-setup.js';
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

describe('Authentication and study-session service behavior', () => {
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

  it('authService: local registration validates e-mail, hashes passwords, assigns students, and handles duplicate races', async () => {
    const created = [];
    const repository = {
      findUserByEmail: async () => null,
      createUser: async (...args) => {
        created.push(args);
        return 8001;
      }
    };

    await expectStatusError(() => authService.registerUser(null, 'password123', repository), 400);
    await expectStatusError(() => authService.registerUser('not-an-email', 'password123', repository), 400);
    await expectStatusError(() => authService.registerUser('x'.repeat(250) + '@example.com', 'password123', repository), 400);
    await expectStatusError(() => authService.registerUser('student@example.com', undefined, repository), 400);
    await expectStatusError(() => authService.registerUser('student@example.com', '', repository), 400);
    await expectStatusError(() => authService.registerUser('student@example.com', 'x'.repeat(129), repository), 400);

    repository.findUserByEmail = async () => ({ id: 1 });
    await expectStatusError(() => authService.registerUser('student@example.com', 'password123', repository), 409);

    repository.findUserByEmail = async () => null;
    const registered = await authService.registerUser(' Student@Example.com ', '!', repository);
    expect(registered).to.deep.equal({
      id: 8001,
      email: 'student@example.com',
      role: 'student'
    });
    expect(created[0][0]).to.equal('student@example.com');
    expect(created[0][2]).to.equal('student');
    expect(await bcrypt.compare('!', created[0][1])).to.equal(true);

    repository.createUser = async () => {
      const conflict = new Error('duplicate key');
      conflict.code = '23505';
      throw conflict;
    };
    await expectStatusError(() => authService.registerUser('student@example.com', 'password123', repository), 409);

    const databaseError = new Error('database unavailable');
    repository.createUser = async () => { throw databaseError; };
    try {
      await authService.registerUser('student@example.com', 'password123', repository);
      expect.fail('unexpected database errors should propagate');
    } catch (err) {
      expect(err).to.equal(databaseError);
    }
  });

  it('authService: Google sign-in requires verified e-mail and matches accounts by Google id', async () => {
    try {
      await authService.authenticateGoogleIdentity({ sub: GOOGLE_ID, email: EMAIL_AUTH, email_verified: false });
      expect.fail('unverified e-mail should be rejected');
    } catch (err) {
      expect(err.status).to.equal(401);
    }

    const linkedLocalUser = await authService.authenticateGoogleIdentity({
      sub: GOOGLE_ID,
      email: EMAIL_AUTH,
      email_verified: true
    });
    expect(linkedLocalUser.id).to.equal(userId);
    expect(linkedLocalUser.passwordSetupRequired).to.equal(false);
    expect((await userRepo.findUserByGoogleId(GOOGLE_ID)).id).to.equal(userId);

    const originalClientId = process.env.GOOGLE_CLIENT_ID;
    const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
    const fetchCalls = [];
    try {
      const user = await authService.authenticateGoogleCode({
        code: 'test-code',
        codeVerifier: 'test-verifier',
        redirectUri: 'https://study-groups.example/api/auth/google/callback'
      }, async (url, options) => {
        fetchCalls.push({ url, options });
        if (url.endsWith('/token')) {
          return { ok: true, json: async () => ({ access_token: 'test-access-token' }) };
        }
        return {
          ok: true,
          json: async () => ({ sub: `${GOOGLE_ID}_new`, email: EMAIL_GOOGLE, email_verified: true })
        };
      });
      googleUserId = user.id;
      expect(user.email).to.equal(EMAIL_GOOGLE);
      expect(user.role).to.equal('student');
      expect(user.passwordSetupRequired).to.equal(true);
      expect(fetchCalls).to.have.length(2);
      expect(fetchCalls[0].options.body.get('code_verifier')).to.equal('test-verifier');

      const returningUser = await authService.authenticateGoogleIdentity({
        sub: `${GOOGLE_ID}_new`,
        email: 'different-address@example.com',
        email_verified: true
      });
      expect(returningUser.id).to.equal(googleUserId);
      expect(returningUser.passwordSetupRequired).to.equal(true);
    } finally {
      if (originalClientId === undefined) {
        delete process.env.GOOGLE_CLIENT_ID;
      } else {
        process.env.GOOGLE_CLIENT_ID = originalClientId;
      }
      if (originalClientSecret === undefined) {
        delete process.env.GOOGLE_CLIENT_SECRET;
      } else {
        process.env.GOOGLE_CLIENT_SECRET = originalClientSecret;
      }
    }
  });

  it('authService: Google-only users can set a password required by account deletion', async () => {
    const repository = {
      findUserByIdWithPassword: async () => null,
      setLocalPasswordForGoogleUser: async () => ({ id: 7001 })
    };

    await expectStatusError(
      () => authService.setGoogleAccountPassword(7001, undefined, repository),
      400
    );
    await expectStatusError(
      () => authService.setGoogleAccountPassword(7001, '', repository),
      400
    );
    await expectStatusError(
      () => authService.setGoogleAccountPassword(7001, 'x'.repeat(129), repository),
      400
    );
    await expectStatusError(
      () => authService.setGoogleAccountPassword(7001, 'new-password', repository),
      404
    );

    repository.findUserByIdWithPassword = async () => ({
      id: 7001,
      google_id: null,
      has_local_password: true
    });
    await expectStatusError(
      () => authService.setGoogleAccountPassword(7001, 'new-password', repository),
      409
    );

    repository.findUserByIdWithPassword = async () => ({
      id: 7001,
      google_id: 'google-sub',
      has_local_password: true
    });
    await expectStatusError(
      () => authService.setGoogleAccountPassword(7001, 'new-password', repository),
      409
    );

    repository.findUserByIdWithPassword = async () => ({
      id: 7001,
      google_id: 'google-sub',
      has_local_password: false
    });
    repository.setLocalPasswordForGoogleUser = async () => null;
    await expectStatusError(
      () => authService.setGoogleAccountPassword(7001, 'new-password', repository),
      409
    );

    let storedHash;
    repository.setLocalPasswordForGoogleUser = async (_userId, passwordHash) => {
      storedHash = passwordHash;
      return { id: 7001 };
    };
    const result = await authService.setGoogleAccountPassword(7001, '!', repository);
    expect(result).to.deep.equal({ success: true });
    expect(await bcrypt.compare('!', storedHash)).to.equal(true);
  });

  it('authService: Google OAuth handles configuration, provider, and identity conflicts', async () => {
    const originalClientId = process.env.GOOGLE_CLIENT_ID;
    const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const codeRequest = {
      code: 'test-code',
      codeVerifier: 'test-verifier',
      redirectUri: 'https://study-groups.example/api/auth/google/callback'
    };

    try {
      delete process.env.GOOGLE_CLIENT_ID;
      await expectStatusError(() => authService.createGoogleAuthorizationUrl({}), 503);

      process.env.GOOGLE_CLIENT_ID = 'test-client-id';
      delete process.env.GOOGLE_CLIENT_SECRET;
      await expectStatusError(() => authService.authenticateGoogleCode(codeRequest, async () => ({})), 503);

      process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
      await expectStatusError(() => authService.authenticateGoogleCode(codeRequest, async () => ({ ok: false })), 401);
      await expectStatusError(() => authService.authenticateGoogleCode(codeRequest, async () => ({
        ok: true,
        json: async () => ({})
      })), 401);
      await expectStatusError(() => authService.authenticateGoogleCode(codeRequest, async (url) => url.endsWith('/token')
        ? { ok: true, json: async () => ({ access_token: 'token' }) }
        : { ok: false }), 401);

      const linkedUser = { id: 7001, email: EMAIL_GOOGLE, role: 'student' };
      let googleIdLookups = 0;
      const racingRepository = {
        findUserByGoogleId: async () => ++googleIdLookups === 1 ? null : linkedUser,
        findUserByEmail: async () => null,
        linkGoogleId: async () => null,
        createGoogleUser: async () => {
          const err = new Error('duplicate key');
          err.code = '23505';
          throw err;
        }
      };
      const raceResult = await authService.authenticateGoogleIdentity({
        sub: GOOGLE_ID,
        email: EMAIL_GOOGLE,
        email_verified: true
      }, racingRepository);
      expect(raceResult.id).to.equal(linkedUser.id);

      const emailOwner = { id: 7002, email: EMAIL_GOOGLE, role: 'student' };
      let emailLookups = 0;
      const emailRaceRepository = {
        findUserByGoogleId: async () => null,
        findUserByEmail: async () => ++emailLookups === 1 ? null : emailOwner,
        linkGoogleId: async () => emailOwner,
        createGoogleUser: async () => {
          const err = new Error('duplicate key');
          err.code = '23505';
          throw err;
        }
      };
      const emailRaceResult = await authService.authenticateGoogleIdentity({
        sub: GOOGLE_ID,
        email: EMAIL_GOOGLE,
        email_verified: true
      }, emailRaceRepository);
      expect(emailRaceResult.id).to.equal(emailOwner.id);

      let linkedUserLookups = 0;
      const linkRaceRepository = {
        findUserByGoogleId: async () => ++linkedUserLookups === 1 ? null : emailOwner,
        findUserByEmail: async () => emailOwner,
        linkGoogleId: async () => null,
        createGoogleUser: async () => { throw new Error('creation should not be reached'); }
      };
      const linkRaceResult = await authService.authenticateGoogleIdentity({
        sub: `${GOOGLE_ID}_link_race`,
        email: EMAIL_GOOGLE,
        email_verified: true
      }, linkRaceRepository);
      expect(linkRaceResult.id).to.equal(emailOwner.id);

      const linkDatabaseError = new Error('link database unavailable');
      const linkFailureRepository = {
        findUserByGoogleId: async () => null,
        findUserByEmail: async () => emailOwner,
        linkGoogleId: async () => { throw linkDatabaseError; },
        createGoogleUser: async () => { throw new Error('creation should not be reached'); }
      };
      try {
        await authService.authenticateGoogleIdentity({
          sub: `${GOOGLE_ID}_link_failure`,
          email: EMAIL_GOOGLE,
          email_verified: true
        }, linkFailureRepository);
        expect.fail('link database failure should propagate');
      } catch (err) {
        expect(err).to.equal(linkDatabaseError);
      }

      let linkedElsewhereLookups = 0;
      const linkedElsewhereRepository = {
        findUserByGoogleId: async () => ++linkedElsewhereLookups === 1
          ? null
          : { id: 7003, email: EMAIL_GOOGLE, role: 'student' },
        findUserByEmail: async () => emailOwner,
        linkGoogleId: async () => {
          const err = new Error('duplicate key');
          err.code = '23505';
          throw err;
        },
        createGoogleUser: async () => { throw new Error('creation should not be reached'); }
      };
      await expectStatusError(() => authService.authenticateGoogleIdentity({
        sub: `${GOOGLE_ID}_conflict`,
        email: EMAIL_GOOGLE,
        email_verified: true
      }, linkedElsewhereRepository), 409);

      const duplicateRepository = {
        findUserByGoogleId: async () => null,
        findUserByEmail: async () => null,
        linkGoogleId: async () => null,
        createGoogleUser: async () => {
          const err = new Error('duplicate key');
          err.code = '23505';
          throw err;
        }
      };
      await expectStatusError(() => authService.authenticateGoogleIdentity({
        sub: GOOGLE_ID,
        email: EMAIL_GOOGLE,
        email_verified: true
      }, duplicateRepository), 409);

      const databaseError = new Error('database unavailable');
      const failingRepository = {
        findUserByGoogleId: async () => null,
        findUserByEmail: async () => null,
        linkGoogleId: async () => null,
        createGoogleUser: async () => { throw databaseError; }
      };
      try {
        await authService.authenticateGoogleIdentity({
          sub: GOOGLE_ID,
          email: EMAIL_GOOGLE,
          email_verified: true
        }, failingRepository);
        expect.fail('database error should propagate');
      } catch (err) {
        expect(err).to.equal(databaseError);
      }
    } finally {
      if (originalClientId === undefined) {
        delete process.env.GOOGLE_CLIENT_ID;
      } else {
        process.env.GOOGLE_CLIENT_ID = originalClientId;
      }
      if (originalClientSecret === undefined) {
        delete process.env.GOOGLE_CLIENT_SECRET;
      } else {
        process.env.GOOGLE_CLIENT_SECRET = originalClientSecret;
      }
    }
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

  it('sessionService: group suggestions match interests and exclude groups the user already joined', async () => {
    const suggestions = await sessionService.suggestGroups(studentId, 'Service 101');
    expect(suggestions.some(group => group.id === groupId)).to.be.true;
    await sessionService.joinGroup(studentId, groupId);
    const eligibleSuggestions = await sessionService.suggestGroups(studentId, 'Service 101');
    expect(eligibleSuggestions.some(group => group.id === groupId)).to.be.false;
    await sessionService.leaveGroup(studentId, groupId);
    await expectStatusError(() => sessionService.suggestGroups(studentId, '   '), 400);
  });

  it('sessionService: getAllUsers is restricted to administrators', async () => {
    const users = await sessionService.getAllUsers(adminId);
    expect(users).to.be.an('array');
    await expectStatusError(() => sessionService.getAllUsers(studentId), 403);
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

});
