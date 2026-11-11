import { describe, it, before, after } from 'node:test';
import request from 'supertest';
import { expect } from 'chai';
import app from '../src/app.js';
import { getDb, checkDbHealth } from '../src/data/db.js';
import * as userRepo from '../src/data/userRepo.js';
import bcrypt from 'bcrypt';
import pg from 'pg';

const { Pool } = pg;

const RUN_ID = `${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
const ADMIN_EMAIL = `admin_cov_${RUN_ID}@example.com`;

describe('Application and data integration edge cases', () => {
  let adminId;

  before(async () => {
    const db = getDb();
    const hash = await bcrypt.hash('password123', 10);
    const uRes = await db.run('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?) RETURNING id', [ADMIN_EMAIL, hash, 'admin']);
    adminId = uRes.lastID;
  });

  after(async () => {
    const db = getDb();
    if (adminId) {
      await db.run('DELETE FROM session_attendance WHERE user_id = ?', [adminId]);
      await db.run('DELETE FROM memberships WHERE user_id = ?', [adminId]);
      await db.run('DELETE FROM group_operators WHERE user_id = ?', [adminId]);
      await db.run('DELETE FROM sessions WHERE group_id IN (SELECT id FROM groups WHERE owner_id = ?)', [adminId]);
      await db.run('DELETE FROM groups WHERE owner_id = ?', [adminId]);
      await db.run('DELETE FROM users WHERE id = ?', [adminId]);
    }
  });

  it('startup exits with a clear error when DATABASE_URL is missing', async () => {
    const originalUrl = process.env.DATABASE_URL;
    const originalExit = process.exit;
    const originalConsoleError = console.error;
    let exitCode;
    let loggedMessage;

    try {
      process.env.DATABASE_URL = '';
      process.exit = (code) => {
        exitCode = code;
        throw new Error(`Exit ${code}`);
      };
      console.error = (message) => {
        loggedMessage = message;
      };

      try {
        await import(`../src/config.js?t=${Date.now()}`);
      } catch (error) {
        expect(error.message).to.equal('Exit 1');
      }

      expect(exitCode).to.equal(1);
      expect(loggedMessage).to.include('DATABASE_URL');
    } finally {
      process.env.DATABASE_URL = originalUrl;
      process.exit = originalExit;
      console.error = originalConsoleError;
    }
  });

  it('GET / redirects visitors to login and authenticated users to sessions', async () => {
    const resNoSession = await request(app).get('/').redirects(0);
    expect(resNoSession.status).to.equal(302);
    expect(resNoSession.header.location).to.equal('/login');

    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: ADMIN_EMAIL, password: 'password123' });
    const resWithSession = await agent.get('/').redirects(0);
    expect(resWithSession.status).to.equal(302);
    expect(resWithSession.header.location).to.equal('/sessions');
  });

  it('GET /login serves the login page and /sessions serves the protected page', async () => {
    const resLogin = await request(app).get('/login');
    expect(resLogin.status).to.equal(200);

    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: ADMIN_EMAIL, password: 'password123' });
    const resSessions = await agent.get('/sessions');
    expect(resSessions.status).to.equal(200);
  });

  it('login returns a server error when the email has an invalid type', async () => {
    const resLoginErr = await request(app)
      .post('/api/auth/login')
      .send({ email: { toString: () => { throw new Error('DB error'); } }, password: 'p' });
    expect(resLoginErr.status).to.equal(500);
    expect(resLoginErr.body.error).to.be.a('string');
  });

  it('updates users without replacing passwords and deletes their owned groups', async () => {
    const hash = await bcrypt.hash('password123', 10);
    const db = getDb();
    let userId;
    let groupId;

    try {
      userId = await userRepo.createUser('owner_test@example.com', hash, 'student');
      const group = await db.run(
        'INSERT INTO groups (name, course_name, owner_id) VALUES (?, ?, ?) RETURNING id',
        ['Owner Group', 'O 101', userId]
      );
      groupId = group.lastID;
      await db.run(
        'INSERT INTO sessions (group_id, title, start_time) VALUES (?, ?, ?)',
        [groupId, 'Owned session', '2030-01-01 10:00:00']
      );

      const update = await userRepo.updateUser(userId, {
        email: 'owner_test_updated@example.com',
        role: 'student'
      });
      expect(update.changes).to.equal(1);

      const updatedUser = await userRepo.findUserByIdWithPassword(userId);
      expect(updatedUser.email).to.equal('owner_test_updated@example.com');
      expect(updatedUser.password_hash).to.equal(hash);

      const deletion = await userRepo.deleteUser(userId);
      expect(deletion.changes).to.equal(1);
      expect(await userRepo.findUserById(userId)).to.be.null;
      expect(await db.get('SELECT id FROM groups WHERE id = ?', [groupId])).to.be.null;
      expect(await db.get('SELECT id FROM sessions WHERE group_id = ?', [groupId])).to.be.null;
    } finally {
      if (userId) {
        await userRepo.deleteUser(userId);
      }
    }
  });

  it('operator routes report missing groups and return an empty list for unknown group IDs', async () => {
    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send({ email: ADMIN_EMAIL, password: 'password123' });
    expect(login.status).to.equal(200);

    const operators = await agent.get('/api/groups/999999/operators');
    expect(operators.status).to.equal(200);
    expect(operators.body).to.deep.equal([]);

    const assignment = await agent.post('/api/groups/999999/operators').send({ userIds: [] });
    expect(assignment.status).to.equal(404);
    expect(assignment.body.error).to.equal('Group not found');
  });

  it('reports database outages through health and authenticated API responses', async () => {
    const agent = request.agent(app);
    const login = await agent
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: 'password123' });
    expect(login.status).to.equal(200);

    const originalQuery = Pool.prototype.query;
    Pool.prototype.query = async function () {
      throw new Error('database unavailable');
    };

    try {
      expect(await checkDbHealth()).to.be.false;

      const health = await request(app).get('/health');
      expect(health.status).to.equal(503);
      expect(health.body).to.deep.equal({ status: 'error', db: 'down' });

      const requests = [
        () => agent.post('/api/groups').send({ name: 'Outage test', courseName: 'Testing' }),
        () => agent.post('/api/sessions').send({
          groupId: 1,
          title: 'Outage test',
          startTime: '2030-01-01 10:00:00',
          endTime: '2030-01-01 11:00:00'
        }),
        () => agent.delete('/api/sessions/1'),
        () => agent.delete('/api/groups/1'),
        () => agent.get('/api/groups/1/operators'),
        () => agent.post('/api/groups/1/operators').send({ userIds: [] }),
        () => agent.post('/api/users').send({ email: 'outage@example.com', password: 'password123' }),
        () => agent.put('/api/users/1').send({ email: 'outage@example.com' }),
        () => agent.delete('/api/users/1').send({ password: 'password123' })
      ];

      for (const makeRequest of requests) {
        const response = await makeRequest();
        expect(response.status).to.equal(500);
        expect(response.body).to.deep.equal({ error: 'database unavailable' });
      }
    } finally {
      Pool.prototype.query = originalQuery;
    }
  });
});
