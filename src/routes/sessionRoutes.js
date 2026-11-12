import express from 'express';
import * as sessionService from '../services/sessionService.js';

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized', redirect: '/login' });
  }
  if (req.session.passwordSetupRequired) {
    return res.status(403).json({
      error: 'Set an app password before using study group features.',
      redirect: '/set-password'
    });
  }
  next();
}

router.post('/groups', requireAuth, async (req, res) => {
  try {
    const { name, courseName } = req.body;
    const groupId = await sessionService.createGroup(req.session.userId, { name, courseName });
    return res.status(201).json({ success: true, groupId });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/sessions', requireAuth, async (req, res) => {
  try {
    const { groupId, title, startTime, endTime } = req.body;
    const sessionId = await sessionService.scheduleSession(req.session.userId, { groupId, title, startTime, endTime });
    return res.status(201).json({ success: true, sessionId });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

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

router.get('/groups/suggestions', requireAuth, async (req, res) => {
  try {
    const groups = await sessionService.suggestGroups(req.session.userId, req.query.interest);
    return res.json(groups);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
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

router.delete('/sessions/:id', requireAuth, async (req, res) => {
  try {
    await sessionService.deleteSession(req.session.userId, req.params.id);
    return res.json({ success: true });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete('/groups/:id', requireAuth, async (req, res) => {
  try {
    await sessionService.deleteGroup(req.session.userId, req.params.id);
    return res.json({ success: true });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/groups/:id/operators', requireAuth, async (req, res) => {
  try {
    const operators = await sessionService.getOperatorsForGroup(req.params.id);
    return res.json(operators);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/groups/:id/operators', requireAuth, async (req, res) => {
  try {
    const { userIds } = req.body;
    await sessionService.assignGroupOperators(req.session.userId, req.params.id, userIds);
    return res.json({ success: true });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/users', requireAuth, async (req, res) => {
  try {
    const users = await sessionService.getAllUsers(req.session.userId);
    return res.json(users);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/users', requireAuth, async (req, res) => {
  try {
    const newUser = await sessionService.adminCreateUser(req.session.userId, req.body);
    return res.json({ success: true, user: newUser });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

router.put('/users/:id', requireAuth, async (req, res) => {
  try {
    const updatedUser = await sessionService.adminUpdateUser(req.session.userId, req.params.id, req.body);
    return res.json({ success: true, user: updatedUser });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete('/users/:id', requireAuth, async (req, res) => {
  try {
    const { password } = req.body;
    await sessionService.adminDeleteUser(req.session.userId, req.params.id, password);
    return res.json({ success: true });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
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

router.post('/summarise-notes', requireAuth, async (req, res) => {
  try {
    const { notes } = req.body;
    const result = await sessionService.summariseNotes(notes);
    return res.json(result);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

export default router;