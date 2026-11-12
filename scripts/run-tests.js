import { spawn } from 'child_process';
import {
  createDatabasePool,
  createTestSchema,
  dropTestSchema,
  getTestDatabaseUrl
} from './test-database-isolation.js';

const connectionString = getTestDatabaseUrl();
if (!connectionString) {
  console.error('DATABASE_URL environment variable is missing');
  process.exit(1);
}

const pool = createDatabasePool(connectionString);

function runSpawn(args, databaseUrl, schemaName) {
  return new Promise((resolve) => {
    const p = spawn('node', args, {
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        NODE_ENV: 'test',
        TEST_DATABASE_SCHEMA: schemaName
      }
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
    await dropTestSchema(connectionString, activeSchema);
    const testSchema = await createTestSchema(connectionString);
    activeSchema = testSchema.schemaName;
    return await runSpawn(testArgs, testSchema.databaseUrl, testSchema.schemaName);
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
      await dropTestSchema(connectionString, activeSchema);
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
