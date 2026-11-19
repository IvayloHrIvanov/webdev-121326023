export const SESSION_COOKIE_NAME = 'connect.sid';
export const SESSION_TIMEOUT_MS = 5 * 60 * 1000;

// Stop at start-up, with a clear message, when a required variable is missing.
const required = ['DATABASE_URL', 'SESSION_SECRET'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`missing ${missing.join(', ')}: see .env.example`);
  process.exit(1);
}
