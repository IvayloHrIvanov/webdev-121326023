import express from 'express';
import * as authService from '../services/authService.js';

const router = express.Router();

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

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

export default router;
