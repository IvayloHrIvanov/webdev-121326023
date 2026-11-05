import * as sessionRepo from '../data/sessionRepo.js';

export function getUpcomingSessions(userId) {
  return sessionRepo.getUpcomingSessionsForUser(userId);
}

export function joinGroup(userId, groupId) {
  return sessionRepo.addMembership(userId, groupId);
}
