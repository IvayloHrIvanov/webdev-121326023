import bcrypt from 'bcrypt';
import * as userRepo from '../data/userRepo.js';

function googleAuthUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    passwordSetupRequired: user.has_local_password === false
  };
}

export async function authenticateUser(email, password) {
  const lowerEmail = email ? email.toLowerCase() : email;
  const user = await userRepo.findUserByEmail(lowerEmail);
  if (!user) {
    return null;
  }
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    return null;
  }
  return { id: user.id, email: user.email, role: user.role };
}

export async function registerUser(email, password, repository = userRepo) {
  if (typeof email !== 'string') {
    const err = new Error('Enter a valid e-mail address');
    err.status = 400;
    throw err;
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (
    normalizedEmail.length > 254
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
  ) {
    const err = new Error('Enter a valid e-mail address');
    err.status = 400;
    throw err;
  }
  if (typeof password !== 'string' || password.length < 1 || password.length > 128) {
    const err = new Error('Password must be between 1 and 128 characters');
    err.status = 400;
    throw err;
  }

  if (await repository.findUserByEmail(normalizedEmail)) {
    const err = new Error('An account with this e-mail already exists');
    err.status = 409;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const id = await repository.createUser(normalizedEmail, passwordHash, 'student');
    return { id, email: normalizedEmail, role: 'student' };
  } catch (error) {
    if (error.code === '23505') {
      const conflict = new Error('An account with this e-mail already exists');
      conflict.status = 409;
      throw conflict;
    }
    throw error;
  }
}

export function createGoogleAuthorizationUrl({ state, codeChallenge, redirectUri }) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    const err = new Error('Google sign-in is not configured');
    err.status = 503;
    throw err;
  }

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  }).toString();
  return url.toString();
}

export async function authenticateGoogleCode({ code, codeVerifier, redirectUri }, fetchImpl = fetch) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    const err = new Error('Google sign-in is not configured');
    err.status = 503;
    throw err;
  }

  const tokenResponse = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier
    }),
    signal: AbortSignal.timeout(10000)
  });
  if (!tokenResponse.ok) {
    const err = new Error('Google sign-in could not be completed');
    err.status = 401;
    throw err;
  }
  const tokens = await tokenResponse.json();
  if (!tokens.access_token) {
    const err = new Error('Google sign-in could not be completed');
    err.status = 401;
    throw err;
  }

  const profileResponse = await fetchImpl('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
    signal: AbortSignal.timeout(10000)
  });
  if (!profileResponse.ok) {
    const err = new Error('Google sign-in could not be completed');
    err.status = 401;
    throw err;
  }
  return await authenticateGoogleIdentity(await profileResponse.json());
}

async function linkVerifiedGoogleAccount(existingUser, googleId, repository) {
  try {
    const linkedUser = await repository.linkGoogleId(existingUser.id, googleId);
    if (linkedUser) {
      return googleAuthUser(linkedUser);
    }
  } catch (err) {
    if (err.code !== '23505') {
      throw err;
    }
  }

  const linkedAfterRace = await repository.findUserByGoogleId(googleId);
  if (linkedAfterRace?.id === existingUser.id) {
    return googleAuthUser(linkedAfterRace);
  }

  const conflict = new Error('This Google account is already linked to another user.');
  conflict.status = 409;
  throw conflict;
}

export async function authenticateGoogleIdentity(profile, repository = userRepo) {
  if (!profile?.sub || !profile.email || profile.email_verified !== true) {
    const err = new Error('Google must provide a verified e-mail address');
    err.status = 401;
    throw err;
  }

  const linkedUser = await repository.findUserByGoogleId(profile.sub);
  if (linkedUser) {
    return googleAuthUser(linkedUser);
  }

  const email = profile.email.toLowerCase();
  const existingUser = await repository.findUserByEmail(email);
  if (existingUser) {
    return await linkVerifiedGoogleAccount(existingUser, profile.sub, repository);
  }

  const passwordHash = await bcrypt.hash(randomBytes(32).toString('base64url'), 10);
  try {
    return googleAuthUser(await repository.createGoogleUser(email, passwordHash, profile.sub));
  } catch (err) {
    const linkedAfterRace = await repository.findUserByGoogleId(profile.sub);
    if (linkedAfterRace) {
      return googleAuthUser(linkedAfterRace);
    }
    if (err.code === '23505') {
      const emailOwner = await repository.findUserByEmail(email);
      if (emailOwner) {
        return await linkVerifiedGoogleAccount(emailOwner, profile.sub, repository);
      }
      const conflict = new Error('This Google account is already linked to another user.');
      conflict.status = 409;
      throw conflict;
    }
    throw err;
  }
}

export async function deleteAccount(userId, password) {
  const user = await userRepo.findUserByIdWithPassword(userId);
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    const err = new Error('Invalid password');
    err.status = 401;
    throw err;
  }
  await userRepo.deleteUser(userId);
  return { success: true };
}

export async function setGoogleAccountPassword(userId, password, repository = userRepo) {
  if (typeof password !== 'string' || password.length < 1 || password.length > 128) {
    const err = new Error('Password must be between 1 and 128 characters');
    err.status = 400;
    throw err;
  }

  const user = await repository.findUserByIdWithPassword(userId);
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  if (!user.google_id || user.has_local_password !== false) {
    const err = new Error('This account does not require Google password setup');
    err.status = 409;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const updated = await repository.setLocalPasswordForGoogleUser(userId, passwordHash);
  if (!updated) {
    const err = new Error('Google password setup has already been completed');
    err.status = 409;
    throw err;
  }
  return { success: true };
}
