import { describe, it } from 'node:test';
import request from 'supertest';
import { expect } from 'chai';
import app from '../src/app.js';

describe('HTTP API routes', () => {
  it('GET /api/auth/me returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).to.equal(401);
    expect(res.body).to.have.property('error');
  });

  it('POST /api/auth/login rejects invalid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nonexistent@example.com', password: 'wrong' });
    expect(res.status).to.equal(401);
    expect(res.body.error).to.equal('Invalid email or password');
  });

  it('GET /api/auth/google starts a state- and PKCE-protected Google sign-in', async () => {
    const previousEnv = {
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
      PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL
    };
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
    process.env.PUBLIC_BASE_URL = 'https://study-groups.example';

    try {
      const agent = request.agent(app);
      const res = await agent.get('/api/auth/google').expect(302);
      const authorizationUrl = new URL(res.headers.location);
      expect(authorizationUrl.origin).to.equal('https://accounts.google.com');
      expect(authorizationUrl.searchParams.get('redirect_uri'))
        .to.equal('https://study-groups.example/api/auth/google/callback');
      expect(authorizationUrl.searchParams.get('code_challenge_method')).to.equal('S256');
      expect(authorizationUrl.searchParams.get('code_challenge')).to.match(/^[A-Za-z0-9_-]{43}$/);
      expect(authorizationUrl.searchParams.get('state')).to.match(/^[A-Za-z0-9_-]{43}$/);

      const callback = await agent.get('/api/auth/google/callback?state=incorrect&code=test-code').expect(302);
      expect(callback.headers.location).to.equal('/login?error=google_state_mismatch');
    } finally {
      for (const [name, value] of Object.entries(previousEnv)) {
        if (value === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = value;
        }
      }
    }
  });

  it('GET /api/auth/google reports missing provider configuration', async () => {
    const previousEnv = {
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
      PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL
    };
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.PUBLIC_BASE_URL;

    try {
      const res = await request(app).get('/api/auth/google').expect(302);
      expect(res.headers.location).to.equal('/login?error=google_not_configured');
    } finally {
      for (const [name, value] of Object.entries(previousEnv)) {
        if (value === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = value;
        }
      }
    }
  });

  it('DELETE /api/auth/account returns 401 when unauthenticated', async () => {
    const res = await request(app).delete('/api/auth/account');
    expect(res.status).to.equal(401);
  });

  it('session endpoints reject unauthenticated requests', async () => {
    const endpoints = [
      { method: 'get', path: '/api/sessions' },
      { method: 'get', path: '/api/groups' },
      { method: 'post', path: '/api/groups' },
      { method: 'post', path: '/api/sessions' },
      { method: 'post', path: '/api/memberships' },
      { method: 'delete', path: '/api/memberships' },
      { method: 'delete', path: '/api/sessions/1' },
      { method: 'delete', path: '/api/groups/1' },
      { method: 'get', path: '/api/groups/1/operators' },
      { method: 'post', path: '/api/groups/1/operators' },
      { method: 'get', path: '/api/users' },
      { method: 'post', path: '/api/users' },
      { method: 'put', path: '/api/users/1' },
      { method: 'delete', path: '/api/users/1' },
      { method: 'post', path: '/api/sessions/1/attendance' },
      { method: 'post', path: '/api/summarise-notes' }
    ];

    for (const ep of endpoints) {
      const res = await request(app)[ep.method](ep.path);
      expect(res.status).to.equal(401);
    }
  });

  it('authenticated users can access their profile and session resources', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'password123' });

    expect(loginRes.status).to.equal(200);
    const cookie = loginRes.header['set-cookie'];

    const meRes = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(meRes.status).to.equal(200);
    expect(meRes.body).to.have.property('id');

    const groupsRes = await request(app).get('/api/groups').set('Cookie', cookie);
    expect(groupsRes.status).to.equal(200);
    expect(groupsRes.body).to.be.an('array');

    const sessionsRes = await request(app).get('/api/sessions').set('Cookie', cookie);
    expect(sessionsRes.status).to.equal(200);
    expect(sessionsRes.body).to.be.an('array');

    const usersRes = await request(app).get('/api/users').set('Cookie', cookie);
    expect(usersRes.status).to.equal(200);
    expect(usersRes.body).to.be.an('array');

    const opsRes = await request(app).get('/api/groups/1/operators').set('Cookie', cookie);
    expect(opsRes.status).to.equal(200);
    expect(opsRes.body).to.be.an('array');

    const logoutRes = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect(logoutRes.status).to.equal(200);
  });

  it('session endpoints return the service validation and not-found statuses', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'password123' });
    expect(loginRes.status).to.equal(200);

    const cookie = loginRes.header['set-cookie'];

    const createGroup = await request(app).post('/api/groups').set('Cookie', cookie).send({});
    expect(createGroup.status).to.equal(400);

    const scheduleSession = await request(app).post('/api/sessions').set('Cookie', cookie).send({});
    expect(scheduleSession.status).to.equal(400);

    const joinMissingGroup = await request(app).post('/api/memberships').set('Cookie', cookie).send({ groupId: 99999 });
    expect(joinMissingGroup.status).to.equal(500);

    const deleteMissingSession = await request(app).delete('/api/sessions/99999').set('Cookie', cookie);
    expect(deleteMissingSession.status).to.equal(404);

    const deleteMissingGroup = await request(app).delete('/api/groups/99999').set('Cookie', cookie);
    expect(deleteMissingGroup.status).to.equal(404);

    const updateAttendanceForMissingSession = await request(app)
      .post('/api/sessions/99999/attendance')
      .set('Cookie', cookie)
      .send({ status: 'attending' });
    expect(updateAttendanceForMissingSession.status).to.equal(500);
    expect(updateAttendanceForMissingSession.body.error).to.include('foreign key');

    const summarizeEmptyNotes = await request(app).post('/api/summarise-notes').set('Cookie', cookie).send({ notes: '' });
    expect(summarizeEmptyNotes.status).to.equal(200);

    const updateMissingUser = await request(app).put('/api/users/99999').set('Cookie', cookie).send({});
    expect(updateMissingUser.status).to.equal(404);

    const createUserWithoutCredentials = await request(app).post('/api/users').set('Cookie', cookie).send({});
    expect(createUserWithoutCredentials.status).to.equal(400);

    const deleteMissingUser = await request(app).delete('/api/users/99999').set('Cookie', cookie).send({ password: 'wrong' });
    expect(deleteMissingUser.status).to.equal(401);
  });
});
