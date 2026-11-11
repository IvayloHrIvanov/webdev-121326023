import { spawn } from 'child_process';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL environment variable is missing');
  process.exit(1);
}

let cleanConnectionString = connectionString;
try {
  const url = new URL(connectionString);
  url.searchParams.delete('sslmode');
  cleanConnectionString = url.toString();
} catch (e) {
  cleanConnectionString = connectionString.replace(/[?&]sslmode=[^&]*(?:&|$)/g, '');
}
const pool = new Pool({
  connectionString: cleanConnectionString,
  ssl: connectionString.includes('neon.tech') || connectionString.includes('sslmode=') ? { rejectUnauthorized: false } : false
});

async function createTestSchema() {
  const schemaName = `test_${randomBytes(12).toString('hex')}`;
  await pool.query(`CREATE SCHEMA "${schemaName}"`);

  const testUrl = new URL(connectionString);
  testUrl.hostname = testUrl.hostname.replace(/-pooler(?=\.|$)/, '');
  testUrl.searchParams.set('options', `-c search_path=${schemaName}`);
  const testPool = new Pool({
    connectionString: testUrl.toString(),
    ssl: connectionString.includes('neon.tech') || connectionString.includes('sslmode=') ? { rejectUnauthorized: false } : false
  });

  try {
    const result = await testPool.query('SELECT current_schema() AS schema');
    if (result.rows[0].schema !== schemaName) {
      throw new Error('PostgreSQL did not select the temporary test schema');
    }
  } catch (err) {
    await pool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    throw err;
  } finally {
    await testPool.end();
  }

  return { schemaName, databaseUrl: testUrl.toString() };
}

async function dropTestSchema(schemaName) {
  if (schemaName) {
    await pool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  }
}

function runSpawn(args, databaseUrl) {
  return new Promise((resolve) => {
    const p = spawn('node', args, {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: 'test' }
    });
    p.on('close', (code) => {
      resolve(code);
    });
  });
}

async function main() {
  let activeSchema = null;
  let exitCode = 0;
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    console.error('Failed to connect to the test database:', err.message);
    await pool.end();
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const runIsolated = async (testArgs) => {
    await dropTestSchema(activeSchema);
    const testSchema = await createTestSchema();
    activeSchema = testSchema.schemaName;
    return await runSpawn(testArgs, testSchema.databaseUrl);
  };

  try {
    if (args.includes('--coverage')) {
      const code1 = await runIsolated([
        '--env-file-if-exists=.env',
        '--test',
        '--experimental-test-coverage',
        '--test-coverage-include=src/services/**',
        '--test-coverage-exclude=tests/**',
        '--test-coverage-lines=100',
        '--test-coverage-functions=100',
        '--test-coverage-branches=100',
        'tests/**/*.test.js'
      ]);
      if (code1 !== 0) {
        exitCode = code1;
      } else {
        const code2 = await runIsolated([
          '--env-file-if-exists=.env',
          '--test',
          '--experimental-test-coverage',
          '--test-coverage-include=src/**',
          '--test-coverage-exclude=tests/**',
          '--test-coverage-lines=80',
          '--test-coverage-functions=80',
          '--test-coverage-branches=80',
          'tests/**/*.test.js'
        ]);
        exitCode = code2;
      }
    } else {
      const testArgs = args.length > 0 ? args : ['tests/**/*.test.js'];
      exitCode = await runIsolated([
        '--env-file-if-exists=.env',
        '--test',
        ...testArgs
      ]);
    }
  } catch (err) {
    console.error('Error executing tests:', err);
    exitCode = 1;
  } finally {
    try {
      await dropTestSchema(activeSchema);
    } catch (err) {
      console.error('Failed to remove the temporary test schema:', err.message);
      exitCode = 1;
    } finally {
      await pool.end();
      process.exit(exitCode);
    }
  }
}

main();
