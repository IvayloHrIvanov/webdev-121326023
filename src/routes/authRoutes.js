import express from 'express';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import * as authService from '../services/authService.js';

const router = express.Router();

function googleRedirectUri() {
  if (!process.env.PUBLIC_BASE_URL) {
    const err = new Error('Google sign-in is not configured');
    err.status = 503;
    throw err;
  }
  let baseUrl;
  try {
    baseUrl = new URL(process.env.PUBLIC_BASE_URL);
  } catch {
    const err = new Error('Google sign-in is not configured');
    err.status = 503;
    throw err;
  }
  if (!['http:', 'https:'].includes(baseUrl.protocol)) {
    const err = new Error('Google sign-in is not configured');
    err.status = 503;
    throw err;
  }
  return new URL('/api/auth/google/callback', baseUrl).toString();
}

function googleErrorRedirect(code) {
  return `/login?error=${encodeURIComponent(code)}`;
}

function matchesState(expected, provided) {
  if (typeof provided !== 'string') {
    return false;
  }
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  return expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes);
}

router.get('/me', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return res.json({
    id: req.session.userId,
    email: req.session.userEmail,
    role: req.session.role
  });
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await authService.authenticateUser(email, password);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    req.session.userId = user.id;
    req.session.userEmail = user.email;
    req.session.role = user.role;
    return res.json({ success: true, user });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/google', (req, res) => {
  try {
    const state = randomBytes(32).toString('base64url');
    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    req.session.googleOAuth = { state, codeVerifier };
    const authorizationUrl = authService.createGoogleAuthorizationUrl({
      state,
      codeChallenge,
      redirectUri: googleRedirectUri()
    });
    return res.redirect(authorizationUrl);
  } catch (err) {
    const code = err.status === 503 ? 'google_not_configured' : 'google_sign_in_failed';
    return res.redirect(googleErrorRedirect(code));
  }
});

router.get('/google/callback', async (req, res) => {
  const pending = req.session?.googleOAuth;
  delete req.session?.googleOAuth;
  if (!pending || !matchesState(pending.state, req.query.state)) {
    return res.redirect(googleErrorRedirect('google_state_mismatch'));
  }
  if (req.query.error || typeof req.query.code !== 'string') {
    return res.redirect(googleErrorRedirect('google_sign_in_cancelled'));
  }

  try {
    const user = await authService.authenticateGoogleCode({
      code: req.query.code,
      codeVerifier: pending.codeVerifier,
      redirectUri: googleRedirectUri()
    });
    await new Promise((resolve, reject) => {
      req.session.regenerate((err) => err ? reject(err) : resolve());
    });
    req.session.userId = user.id;
    req.session.userEmail = user.email;
    req.session.role = user.role;
    return res.redirect('/sessions');
  } catch (err) {
    const code = err.status === 409 ? 'google_account_exists' : 'google_sign_in_failed';
    return res.redirect(googleErrorRedirect(code));
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

router.delete('/account', async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const { password } = req.body;
    await authService.deleteAccount(req.session.userId, password);
    req.session.destroy(() => {
      return res.json({ success: true });
    });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

export default router;
