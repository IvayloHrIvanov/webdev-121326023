import express from 'express';
import * as sessionService from '../services/sessionService.js';

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized', redirect: '/login' });
  }
  next();
}

router.get('/sessions', requireAuth, async (req, res) => {
  try {
    const sessions = await sessionService.getUpcomingSessions(req.session.userId);
    return res.json(sessions);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/groups', requireAuth, async (req, res) => {
  try {
    const groups = await sessionService.getAllGroups(req.session.userId);
    return res.json(groups);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/memberships', requireAuth, async (req, res) => {
  try {
    const { groupId } = req.body;
    await sessionService.joinGroup(req.session.userId, groupId);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete('/memberships', requireAuth, async (req, res) => {
  try {
    const { groupId } = req.body;
    await sessionService.leaveGroup(req.session.userId, groupId);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// New endpoint for updating individual session attendance
router.post('/sessions/:id/attendance', requireAuth, async (req, res) => {
  try {
    const sessionId = req.params.id;
    const { status } = req.body; // 'attending' or 'not_attending'
    await sessionService.updateSessionAttendance(req.session.userId, sessionId, status);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;