import { spawn } from 'child_process';
import pg from 'pg';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL environment variable is missing');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('neon.tech') || connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : false
});

async function takeSnapshot() {
  const users = (await pool.query('SELECT * FROM users')).rows;
  const groups = (await pool.query('SELECT * FROM groups')).rows;
  const memberships = (await pool.query('SELECT * FROM memberships')).rows;
  const groupOperators = (await pool.query('SELECT * FROM group_operators')).rows;
  const sessions = (await pool.query('SELECT * FROM sessions')).rows;
  const sessionAttendance = (await pool.query('SELECT * FROM session_attendance')).rows;

  return {
    users,
    groups,
    memberships,
    groupOperators,
    sessions,
    sessionAttendance
  };
}

async function restoreSnapshot(snapshot) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query('DELETE FROM session_attendance');
    await client.query('DELETE FROM sessions');
    await client.query('DELETE FROM group_operators');
    await client.query('DELETE FROM memberships');
    await client.query('DELETE FROM groups');
    await client.query('DELETE FROM users');

    for (const u of snapshot.users) {
      await client.query(
        'INSERT INTO users (id, email, password_hash, created_at, role) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash, created_at = EXCLUDED.created_at, role = EXCLUDED.role',
        [u.id, u.email, u.password_hash, u.created_at, u.role]
      );
    }

    for (const g of snapshot.groups) {
      await client.query(
        'INSERT INTO groups (id, name, course_name, owner_id, created_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, course_name = EXCLUDED.course_name, owner_id = EXCLUDED.owner_id, created_at = EXCLUDED.created_at',
        [g.id, g.name, g.course_name, g.owner_id, g.created_at]
      );
    }

    for (const m of snapshot.memberships) {
      await client.query(
        'INSERT INTO memberships (user_id, group_id) VALUES ($1, $2) ON CONFLICT (user_id, group_id) DO NOTHING',
        [m.user_id, m.group_id]
      );
    }

    for (const go of snapshot.groupOperators) {
      await client.query(
        'INSERT INTO group_operators (group_id, user_id) VALUES ($1, $2) ON CONFLICT (group_id, user_id) DO NOTHING',
        [go.group_id, go.user_id]
      );
    }

    for (const s of snapshot.sessions) {
      await client.query(
        'INSERT INTO sessions (id, group_id, title, start_time, created_at, end_time) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO UPDATE SET group_id = EXCLUDED.group_id, title = EXCLUDED.title, start_time = EXCLUDED.start_time, created_at = EXCLUDED.created_at, end_time = EXCLUDED.end_time',
        [s.id, s.group_id, s.title, s.start_time, s.created_at, s.end_time]
      );
    }

    for (const sa of snapshot.sessionAttendance) {
      await client.query(
        'INSERT INTO session_attendance (user_id, session_id, status) VALUES ($1, $2, $3) ON CONFLICT (user_id, session_id) DO UPDATE SET status = EXCLUDED.status',
        [sa.user_id, sa.session_id, sa.status]
      );
    }

    await client.query("SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE((SELECT MAX(id) FROM users), 1), true)");
    await client.query("SELECT setval(pg_get_serial_sequence('groups', 'id'), COALESCE((SELECT MAX(id) FROM groups), 1), true)");
    await client.query("SELECT setval(pg_get_serial_sequence('sessions', 'id'), COALESCE((SELECT MAX(id) FROM sessions), 1), true)");

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to restore DB snapshot:', err);
  } finally {
    client.release();
  }
}

async function main() {
  let snapshot = null;
  try {
    const dummyClient = await pool.connect();
    dummyClient.release();

    snapshot = await takeSnapshot();
  } catch (err) {
    console.error('Failed to take initial DB snapshot:', err);
    process.exit(1);
  }

  const testProcess = spawn('node', ['--env-file-if-exists=.env', '--test', 'tests/**/*.test.js'], {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'test' }
  });

  testProcess.on('close', async (code) => {
    try {
      await restoreSnapshot(snapshot);
    } catch (err) {
      console.error('Error during snapshot restoration after tests:', err);
    } finally {
      await pool.end();
      process.exit(code);
    }
  });
}

main();
