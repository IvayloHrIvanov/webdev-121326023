import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let poolInstance = null;
let migrationPromise = null;

export function getDb() {
  if (!poolInstance) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is missing');
    }
    let cleanConnectionString = connectionString;
    try {
      const url = new URL(connectionString);
      url.searchParams.delete('sslmode');
      cleanConnectionString = url.toString();
    } catch (e) {
      cleanConnectionString = connectionString.replace(/[?&]sslmode=[^&]*(?:&|$)/g, '');
    }
    poolInstance = new Pool({
      connectionString: cleanConnectionString,
      ssl: connectionString.includes('neon.tech') || connectionString.includes('sslmode=') ? { rejectUnauthorized: false } : false
    });
  }

  return {
    async get(sql, params = []) {
      await ensureMigrations(poolInstance);
      const { convertedSql, convertedParams } = convertPlaceholders(sql, params);
      const res = await poolInstance.query(convertedSql, convertedParams);
      return res.rows[0] || null;
    },
    async all(sql, params = []) {
      await ensureMigrations(poolInstance);
      const { convertedSql, convertedParams } = convertPlaceholders(sql, params);
      const res = await poolInstance.query(convertedSql, convertedParams);
      return res.rows;
    },
    async run(sql, params = []) {
      await ensureMigrations(poolInstance);
      const { convertedSql, convertedParams } = convertPlaceholders(sql, params);
      const res = await poolInstance.query(convertedSql, convertedParams);
      return {
        lastID: res.rows[0]?.id !== undefined ? res.rows[0].id : null,
        changes: res.rowCount
      };
    }
  };
}

export async function checkDbHealth() {
  try {
    const db = getDb();
    await db.get('SELECT 1');
    return true;
  } catch (err) {
    return false;
  }
}

function convertPlaceholders(sql, params) {
  let paramIndex = 1;
  const convertedSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
  return { convertedSql, convertedParams: params };
}

async function ensureMigrations(pool) {
  if (!migrationPromise) {
    migrationPromise = (async () => {
      const migrationsDir = path.join(__dirname, '../../migrations');
      if (fs.existsSync(migrationsDir)) {
        const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
        for (const file of files) {
          const filePath = path.join(migrationsDir, file);
          const migrationSql = fs.readFileSync(filePath, 'utf8');
          try {
            await pool.query(migrationSql);
          } catch (err) {
            if (
              !err.message.includes('already exists') &&
              !err.message.includes('duplicate column')
            ) {
              console.error(`Migration error in ${file}:`, err.message);
              throw err;
            }
          }
        }
      }
    })();
  }
  return migrationPromise;
}
