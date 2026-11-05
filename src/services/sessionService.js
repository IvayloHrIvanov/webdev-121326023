import * as sessionRepo from '../data/sessionRepo.js';

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