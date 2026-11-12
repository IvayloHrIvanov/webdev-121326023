import { after } from 'node:test';
import {
  createTestSchema,
  dropTestSchema,
  getTestDatabaseUrl,
  verifyTestSchema
} from '../scripts/test-database-isolation.js';

const connectionString = getTestDatabaseUrl();
if (!connectionString) {
  throw new Error('Tests require DATABASE_URL in the environment or .env file');
}

process.env.NODE_ENV = 'test';

const runnerSchema = process.env.TEST_DATABASE_SCHEMA;
if (runnerSchema) {
  await verifyTestSchema(connectionString, runnerSchema);
} else {
  const testSchema = await createTestSchema(connectionString);
  process.env.DATABASE_URL = testSchema.databaseUrl;
  after(async () => {
    await dropTestSchema(connectionString, testSchema.schemaName);
  });
}
