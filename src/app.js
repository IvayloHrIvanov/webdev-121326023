import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/authRoutes.js';
import sessionRoutes from './routes/sessionRoutes.js';

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

export default app;
