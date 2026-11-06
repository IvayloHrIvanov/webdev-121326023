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