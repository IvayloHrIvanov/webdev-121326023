import '../scripts/test-database-setup.js';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { describe, it } from 'node:test';
import request from 'supertest';
import { expect } from 'chai';
import app from '../src/app.js';
import { SESSION_TIMEOUT_MS } from '../src/config.js';

const timeoutScript = await readFile(new URL('../public/session-timeout.js', import.meta.url), 'utf8');

function createTimeoutPage() {
  let now = 0;
  let nextTimerId = 1;
  const timers = new Map();
  const documentListeners = {};
  const windowListeners = {};
  const requests = [];
  const warning = { hidden: true };
  const message = { innerText: 'Your session will expire in 1 minute due to inactivity.' };
  const staySignedInButton = {
    listeners: {},
    addEventListener(event, listener) {
      this.listeners[event] = listener;
    }
  };
  const document = {
    getElementById(id) {
      return {
        'session-timeout-warning': warning,
        'session-timeout-message': message,
        'stay-signed-in': staySignedInButton
      }[id];
    },
    addEventListener(event, listener) {
      documentListeners[event] = listener;
    }
  };
  const window = {
    location: {
      replace(url) {
        this.href = url;
      }
    },
    addEventListener(event, listener) {
      windowListeners[event] = listener;
    }
  };
  class FakeDate extends Date {
    static now() {
      return now;
    }
  }

  vm.runInNewContext(timeoutScript, {
    Date: FakeDate,
    document,
    window,
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, status: 204 };
    },
    setTimeout(callback, delay) {
      const id = nextTimerId++;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    }
  });
  window.startSessionTimeout();

  return {
    warning,
    message,
    requests,
    staySignedIn() {
      staySignedInButton.listeners.click();
    },
    async advanceBy(duration) {
      const target = now + duration;
      while (true) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        const [id, timer] = due;
        timers.delete(id);
        now = timer.at;
        timer.callback();
        await Promise.resolve();
        await Promise.resolve();
      }
      now = target;
      await Promise.resolve();
      await Promise.resolve();
    },
    window
  };
}

function getSessionId(cookiePair) {
  return decodeURIComponent(cookiePair.slice(cookiePair.indexOf('=') + 1))
    .slice(2)
    .split('.')[0];
}

function storeCall(store, method, ...args) {
  return new Promise((resolve, reject) => {
    store[method](...args, (err, result) => err ? reject(err) : resolve(result));
  });
}

describe('Session inactivity timeout', () => {
  it('AC-29: warns after four minutes and lets an active user extend the session', async () => {
    const page = createTimeoutPage();

    await page.advanceBy(4 * 60 * 1000);
    expect(page.warning.hidden).to.equal(false);
    expect(page.message.innerText).to.equal('Your session will expire in 1 minute due to inactivity.');

    page.staySignedIn();
    expect(page.warning.hidden).to.equal(true);
    expect(page.requests.some((requestDetails) => requestDetails.url === '/api/auth/activity')).to.equal(true);
    await page.advanceBy(2 * 60 * 1000);
    expect(page.window.location.href).to.equal(undefined);
  });

  it('AC-29: automatically signs out after five minutes and redirects to sign-in', async () => {
    const page = createTimeoutPage();

    await page.advanceBy(SESSION_TIMEOUT_MS);
    expect(page.requests.some((requestDetails) => requestDetails.url === '/api/auth/logout')).to.equal(true);
    expect(page.window.location.href).to.equal('/login?error=session_timeout');
  });

  it('AC-29: expires the server session and clears only its authentication cookie', async () => {
    const agent = request.agent(app);
    const login = await agent
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'password123' })
      .expect(200);
    const sessionCookie = login.headers['set-cookie'].find((cookie) => cookie.startsWith('connect.sid='));
    expect(sessionCookie).to.include('Expires=');
    const cookieExpiration = new Date(sessionCookie.match(/Expires=([^;]+)/)[1]).getTime();
    const responseDate = new Date(login.headers.date).getTime();
    expect(cookieExpiration - responseDate).to.be.within(SESSION_TIMEOUT_MS - 1000, SESSION_TIMEOUT_MS + 1000);

    const cookiePair = sessionCookie.split(';')[0];
    const sessionId = getSessionId(cookiePair);
    const store = app.locals.sessionStore;
    const sessionData = await storeCall(store, 'get', sessionId);
    sessionData.lastActivityAt = Date.now() - SESSION_TIMEOUT_MS - 1;
    await storeCall(store, 'set', sessionId, sessionData);

    const expiredResponse = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `${cookiePair}; theme=dark`)
      .expect(401);
    const clearedCookies = expiredResponse.headers['set-cookie'];
    expect(clearedCookies.some((cookie) => cookie.startsWith('connect.sid=;'))).to.equal(true);
    expect(clearedCookies.some((cookie) => cookie.startsWith('theme=;'))).to.equal(false);
    expect(await storeCall(store, 'get', sessionId)).to.be.oneOf([null, undefined]);
  });

  it('renews authenticated activity and rejects unauthenticated activity pings', async () => {
    await request(app).post('/api/auth/activity').expect(401);

    const agent = request.agent(app);
    await agent.post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'password123' })
      .expect(200);
    const activity = await agent.post('/api/auth/activity').expect(204);
    expect(activity.headers['set-cookie'].some((cookie) => cookie.includes('Expires='))).to.equal(true);
    await agent.get('/api/auth/me').expect(200);
  });

  it('AC-29: serves the timeout warning, activity script, and sign-in message', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'password123' })
      .expect(200);

    const sessionsPage = await agent.get('/sessions').expect(200);
    const loginPage = await request(app).get('/login').expect(200);
    const timeoutScriptResponse = await request(app).get('/session-timeout.js').expect(200);
    const setPasswordPage = await readFile(new URL('../public/set-password.html', import.meta.url), 'utf8');

    expect(sessionsPage.text).to.include('Your session will expire in 1 minute due to inactivity.');
    expect(sessionsPage.text).to.include('src="/session-timeout.js"');
    expect(setPasswordPage).to.include('id="session-timeout-warning"');
    expect(setPasswordPage).to.include('src="/session-timeout.js"');
    expect(timeoutScriptResponse.text).to.include('/api/auth/activity');
    expect(loginPage.text).to.include('Your session expired after 5 minutes of inactivity.');
  });
});
