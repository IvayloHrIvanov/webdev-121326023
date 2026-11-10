import './config.js';
import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/authRoutes.js';
import sessionRoutes from './routes/sessionRoutes.js';
import * as sessionService from './services/sessionService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'secret-key',
  resave: false,
  saveUninitialized: false
}));

// Authentication check middleware for HTML pages
function checkAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.redirect('/login');
  }
  next();
}

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// Health check endpoint (Route -> Service -> Data)
app.get('/health', async (req, res) => {
  try {
    const isHealthy = await sessionService.checkHealth();
    if (isHealthy) {
      return res.status(200).json({ status: 'ok', db: 'ok' });
    } else {
      return res.status(503).json({ status: 'error', db: 'down' });
    }
  } catch (err) {
    return res.status(503).json({ status: 'error', db: 'down' });
  }
});

// HTML Routes
app.get('/', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/sessions');
  }
  return res.redirect('/login');
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

app.get('/sessions', checkAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/sessions.html'));
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api', sessionRoutes);

// Unknown path handler (404)
app.use((req, res) => {
  res.status(404).json({ error: 'The requested resource could not be found.' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server error stack:', err);
  const isSyntaxError = err instanceof SyntaxError && err.status === 400 && 'body' in err;
  const status = isSyntaxError || err.status === 400 ? 400 : (err.status || 500);
  const message = status === 400 
    ? 'The request could not be processed due to invalid syntax or broken JSON.' 
    : 'An unexpected error occurred on the server.';
  res.status(status).json({ error: message });
});

export default app;
