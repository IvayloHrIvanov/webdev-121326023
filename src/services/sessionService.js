import * as sessionRepo from '../data/sessionRepo.js';
import * as userRepo from '../data/userRepo.js';

export function getUpcomingSessions(userId) {
  return sessionRepo.getUpcomingSessionsForUser(userId);
}

export function getAllGroups(userId) {
  return sessionRepo.getAllGroupsForUser(userId);
}

export function joinGroup(userId, groupId) {
  return sessionRepo.addMembership(userId, groupId);
}

export function leaveGroup(userId, groupId) {
  return sessionRepo.removeMembership(userId, groupId);
}

export function updateSessionAttendance(userId, sessionId, status) {
  return sessionRepo.setSessionAttendance(userId, sessionId, status);
}

export async function createGroup(userId, { name, courseName }) {
  if (!name || !courseName) {
    const err = new Error('Name cannot be empty');
    err.status = 400;
    throw err;
  }
  const user = userRepo.findUserById(userId);
  if (!user || user.role !== 'admin') {
    const err = new Error('Forbidden: Only admins can create study groups');
    err.status = 403;
    throw err;
  }
  return sessionRepo.createGroup(name, courseName, userId);
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

  const user = userRepo.findUserById(userId);
  if (!user) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }

  const group = sessionRepo.getGroupById(groupId);
  if (!group) {
    const err = new Error('Group not found');
    err.status = 404;
    throw err;
  }

  // Authorization check (AC-20): Admin can schedule, or assigned group operator
  const isAdmin = user.role === 'admin';
  const isOperator = sessionRepo.isGroupOperator(groupId, userId);
  if (!isAdmin && !isOperator) {
    const err = new Error('Forbidden: Only the assigned group operator or admin can schedule sessions');
    err.status = 403;
    throw err;
  }

  // Clash check (AC-19)
  const conflict = sessionRepo.getConflictingSession(groupId, startTime, endTime);
  if (conflict) {
    const err = new Error(`Conflict: Overlaps with existing session "${conflict.title}"`);
    err.status = 409;
    throw err;
  }

  return sessionRepo.createSession(groupId, title, startTime, endTime);
}

export async function deleteSession(userId, sessionId) {
  const user = userRepo.findUserById(userId);
  if (!user) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }
  const session = sessionRepo.getSessionById(sessionId);
  if (!session) {
    const err = new Error('Session not found');
    err.status = 404;
    throw err;
  }
  const isAdmin = user.role === 'admin';
  const isOperator = sessionRepo.isGroupOperator(session.group_id, userId);
  if (!isAdmin && !isOperator) {
    const err = new Error('Forbidden: Only the assigned group operator or admin can delete sessions');
    err.status = 403;
    throw err;
  }
  return sessionRepo.deleteSession(sessionId);
}

export async function deleteGroup(userId, groupId) {
  const user = userRepo.findUserById(userId);
  if (!user || user.role !== 'admin') {
    const err = new Error('Forbidden: Only admins can delete study groups');
    err.status = 403;
    throw err;
  }
  const group = sessionRepo.getGroupById(groupId);
  if (!group) {
    const err = new Error('Group not found');
    err.status = 404;
    throw err;
  }
  return sessionRepo.deleteGroup(groupId);
}

export async function assignGroupOperators(userId, groupId, userIds) {
  const user = userRepo.findUserById(userId);
  if (!user || user.role !== 'admin') {
    const err = new Error('Forbidden: Only admins can assign group operators');
    err.status = 403;
    throw err;
  }
  const group = sessionRepo.getGroupById(groupId);
  if (!group) {
    const err = new Error('Group not found');
    err.status = 404;
    throw err;
  }
  return sessionRepo.setOperatorsForGroup(groupId, userIds);
}

export function getOperatorsForGroup(groupId) {
  return sessionRepo.getOperatorsForGroup(groupId);
}

export function getAllUsers() {
  return userRepo.getAllUsers();
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
        contents: [{
          parts: [{ text: `Summarize the following study session notes into exactly two lines and select 3 tags from [${COURSE_TOPICS.join(', ')}]. Format as JSON with summary and tags:\n\n${notes}` }]
        }]
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`API error: ${res.status}`);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Invalid model response');
    }

    try {
      const parsed = JSON.parse(text);
      if (parsed.summary && Array.isArray(parsed.tags)) {
        const validTags = parsed.tags.filter(t => COURSE_TOPICS.includes(t));
        while (validTags.length < 3) {
          validTags.push(COURSE_TOPICS[validTags.length % COURSE_TOPICS.length]);
        }
        return {
          summary: parsed.summary,
          tags: validTags.slice(0, 3)
        };
      }
    } catch (e) {}

    return fallback();
  } catch (err) {
    return fallback();
  }
}