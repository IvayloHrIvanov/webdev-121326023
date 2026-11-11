import * as sessionRepo from '../data/sessionRepo.js';
import * as userRepo from '../data/userRepo.js';
import { checkDbHealth } from '../data/db.js';
import bcrypt from 'bcrypt';

export async function checkHealth() {
  return await checkDbHealth();
}

export async function getUpcomingSessions(userId) {
  return await sessionRepo.getUpcomingSessionsForUser(userId);
}

export async function getAllGroups(userId) {
  return await sessionRepo.getAllGroupsForUser(userId);
}

export async function joinGroup(userId, groupId) {
  return await sessionRepo.addMembership(userId, groupId);
}

export async function leaveGroup(userId, groupId) {
  return await sessionRepo.removeMembership(userId, groupId);
}

export async function updateSessionAttendance(userId, sessionId, status) {
  return await sessionRepo.setSessionAttendance(userId, sessionId, status);
}

export async function createGroup(userId, { name, courseName }) {
  if (!name || !courseName) {
    const err = new Error('Name cannot be empty');
    err.status = 400;
    throw err;
  }
  const user = await userRepo.findUserById(userId);
  if (!user || user.role !== 'admin') {
    const err = new Error('Forbidden: Only admins can create study groups');
    err.status = 403;
    throw err;
  }
  return await sessionRepo.createGroup(name, courseName, userId);
}

export async function scheduleSession(userId, { groupId, title, startTime, endTime }) {
  if (!groupId || !title || !startTime || !endTime) {
    const err = new Error('Missing required fields');
    err.status = 400;
    throw err;
  }
  if (new Date(startTime) >= new Date(endTime)) {
    const err = new Error('Start time must be before end time');
    err.status = 400;
    throw err;
  }

  const user = await userRepo.findUserById(userId);
  if (!user) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }

  const group = await sessionRepo.getGroupById(groupId);
  if (!group) {
    const err = new Error('Group not found');
    err.status = 404;
    throw err;
  }

  // Authorization check (AC-20): Admin can schedule, or assigned group operator
  const isAdmin = user.role === 'admin';
  const isOperator = await sessionRepo.isGroupOperator(groupId, userId);
  if (!isAdmin && !isOperator) {
    const err = new Error('Forbidden: Only the assigned group operator or admin can schedule sessions');
    err.status = 403;
    throw err;
  }

  // Clash check (AC-19)
  const conflict = await sessionRepo.getConflictingSession(groupId, startTime, endTime);
  if (conflict) {
    const err = new Error(`Conflict: Overlaps with existing session "${conflict.title}"`);
    err.status = 409;
    throw err;
  }

  return await sessionRepo.createSession(groupId, title, startTime, endTime);
}

export async function deleteSession(userId, sessionId) {
  const user = await userRepo.findUserById(userId);
  if (!user) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }
  const session = await sessionRepo.getSessionById(sessionId);
  if (!session) {
    const err = new Error('Session not found');
    err.status = 404;
    throw err;
  }
  const isAdmin = user.role === 'admin';
  const isOperator = await sessionRepo.isGroupOperator(session.group_id, userId);
  if (!isAdmin && !isOperator) {
    const err = new Error('Forbidden: Only the assigned group operator or admin can delete sessions');
    err.status = 403;
    throw err;
  }
  return await sessionRepo.deleteSession(sessionId);
}

export async function deleteGroup(userId, groupId) {
  const user = await userRepo.findUserById(userId);
  if (!user || user.role !== 'admin') {
    const err = new Error('Forbidden: Only admins can delete study groups');
    err.status = 403;
    throw err;
  }
  const group = await sessionRepo.getGroupById(groupId);
  if (!group) {
    const err = new Error('Group not found');
    err.status = 404;
    throw err;
  }
  return await sessionRepo.deleteGroup(groupId);
}

export async function assignGroupOperators(userId, groupId, userIds) {
  const user = await userRepo.findUserById(userId);
  if (!user || user.role !== 'admin') {
    const err = new Error('Forbidden: Only admins can assign group operators');
    err.status = 403;
    throw err;
  }
  const group = await sessionRepo.getGroupById(groupId);
  if (!group) {
    const err = new Error('Group not found');
    err.status = 404;
    throw err;
  }
  return await sessionRepo.setOperatorsForGroup(groupId, userIds);
}

export async function getOperatorsForGroup(groupId) {
  return await sessionRepo.getOperatorsForGroup(groupId);
}

export async function getAllUsers() {
  return await userRepo.getAllUsers();
}

export async function adminCreateUser(adminId, { email, password, role }) {
  const admin = await userRepo.findUserById(adminId);
  if (!admin || admin.role !== 'admin') {
    const err = new Error('Forbidden: Only admins can create users');
    err.status = 403;
    throw err;
  }
  if (!email || !password) {
    const err = new Error('Email and password are required');
    err.status = 400;
    throw err;
  }
  const lowerEmail = email.toLowerCase();
  const existing = await userRepo.findUserByEmail(lowerEmail);
  if (existing) {
    const err = new Error('User with this email already exists');
    err.status = 400;
    throw err;
  }
  try {
    const validRole = ['student', 'operator', 'admin'].includes(role) ? role : 'student';
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = await userRepo.createUser(lowerEmail, hashedPassword, validRole);
    return { id: userId, email: lowerEmail, role: validRole };
  } catch (e) {
    const err = new Error('User with this email already exists or invalid email');
    err.status = 400;
    throw err;
  }
}

export async function adminUpdateUser(adminId, targetUserId, { email, password, role }) {
  const admin = await userRepo.findUserById(adminId);
  if (!admin || admin.role !== 'admin') {
    const err = new Error('Forbidden: Only admins can update users');
    err.status = 403;
    throw err;
  }
  const targetUser = await userRepo.findUserById(targetUserId);
  if (!targetUser) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  const lowerEmail = email ? email.toLowerCase() : targetUser.email;
  if (email && lowerEmail !== targetUser.email) {
    const existing = await userRepo.findUserByEmail(lowerEmail);
    if (existing) {
      const err = new Error('User with this email already exists');
      err.status = 400;
      throw err;
    }
  }
  try {
    const updatedRole = ['student', 'operator', 'admin'].includes(role) ? role : targetUser.role;
    let passwordHash = null;
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }
    await userRepo.updateUser(targetUserId, { email: lowerEmail, role: updatedRole, passwordHash });
    return { id: Number(targetUserId), email: lowerEmail, role: updatedRole };
  } catch (e) {
    const err = new Error('User with this email already exists or invalid email');
    err.status = 400;
    throw err;
  }
}

export async function adminDeleteUser(adminId, targetUserId, password) {
  const admin = await userRepo.findUserByIdWithPassword(adminId);
  if (!admin || admin.role !== 'admin') {
    const err = new Error('Forbidden: Only admins can delete users');
    err.status = 403;
    throw err;
  }
  const match = await bcrypt.compare(password, admin.password_hash);
  if (!match) {
    const err = new Error('Invalid admin password');
    err.status = 401;
    throw err;
  }
  const targetUser = await userRepo.findUserById(targetUserId);
  if (!targetUser) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  await userRepo.deleteUser(targetUserId);
  return { success: true };
}

export const COURSE_TOPICS = [
  "Databases", "Algorithms", "Networking", "Security",
  "Architecture", "Testing", "JavaScript", "Python", "Web", "AI"
];

export async function summariseNotes(notes, { client, apiKey } = {}) {
  const key = apiKey || process.env.GEMINI_API_KEY;

  const fallback = () => {
    const lines = (notes || '').split('\n').filter(Boolean);
    const line1 = lines[0] || 'Summary line 1';
    const line2 = lines[1] || 'Summary line 2';
    return {
      summary: `${line1}\n${line2}`,
      tags: ['Databases', 'Testing', 'JavaScript']
    };
  };

  if (client) {
    try {
      return await client(notes);
    } catch (e) {
      return fallback();
    }
  }

  if (!key) {
    return fallback();
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `Summarise these study session notes into a two-line summary and provide three tags from this list: [${COURSE_TOPICS.join(', ')}]. Return JSON format with keys "summary" (string) and "tags" (array of 3 strings).\n\nNotes:\n${notes}`
              }
            ]
          }
        ]
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return fallback();
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return fallback();
    }

    let parsed;
    try {
      const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return fallback();
    }

    if (!parsed || typeof parsed.summary !== 'string' || !Array.isArray(parsed.tags)) {
      return fallback();
    }

    const validTags = parsed.tags.filter(t => COURSE_TOPICS.includes(t));
    if (validTags.length < 3) {
      return fallback();
    }

    const summaryLines = parsed.summary.split('\n').filter(Boolean);
    const summary = summaryLines.slice(0, 2).join('\n') || fallback().summary;

    return {
      summary,
      tags: validTags.slice(0, 3)
    };
  } catch (e) {
    return fallback();
  }
}
