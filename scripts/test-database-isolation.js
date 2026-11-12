import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const envFile = fileURLToPath(new URL('../.env', import.meta.url));

export function createDatabasePool(connectionString) {
  let cleanConnectionString = connectionString;
  try {
    const url = new URL(connectionString);
    url.searchParams.delete('sslmode');
    cleanConnectionString = url.toString();
  } catch {
    cleanConnectionString = connectionString.replace(/[?&]sslmode=[^&]*(?:&|$)/g, '');
  }

  return new Pool({
    connectionString: cleanConnectionString,
    ssl: connectionString.includes('neon.tech') || connectionString.includes('sslmode=')
      ? { rejectUnauthorized: false }
      : false
  });
}

export function getTestDatabaseUrl() {
  if (!process.env.DATABASE_URL && existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }
  return process.env.DATABASE_URL;
}

export async function verifyTestSchema(connectionString, schemaName) {
  const pool = createDatabasePool(connectionString);
  try {
    const result = await pool.query('SELECT current_schema() AS schema');
    if (result.rows[0].schema !== schemaName) {
      throw new Error(`Test database search_path is not isolated to schema ${schemaName}`);
    }
  } finally {
    await pool.end();
  }
}

export async function createTestSchema(connectionString) {
  const schemaName = `test_${randomBytes(12).toString('hex')}`;
  const pool = createDatabasePool(connectionString);
  let schemaCreated = false;

  try {
    await pool.query(`CREATE SCHEMA "${schemaName}"`);
    schemaCreated = true;

    const testUrl = new URL(connectionString);
    testUrl.hostname = testUrl.hostname.replace(/-pooler(?=\.|$)/, '');
    testUrl.searchParams.set('options', `-c search_path=${schemaName}`);
    const databaseUrl = testUrl.toString();
    await verifyTestSchema(databaseUrl, schemaName);

    return { schemaName, databaseUrl };
  } catch (error) {
    if (schemaCreated) {
      try {
        await pool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], 'Failed to create and clean up the isolated test schema');
      }
    }
    throw error;
  } finally {
    await pool.end();
  }
}

export async function dropTestSchema(connectionString, schemaName) {
  if (!schemaName) return;
  if (!/^test_[a-f0-9]{24}$/.test(schemaName)) {
    throw new Error('Refusing to drop a schema that was not created by the test runner');
  }

  const pool = createDatabasePool(connectionString);
  try {
    await pool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  } finally {
    await pool.end();
  }
}
