import { getDb } from '../src/data/db.js';

async function seed() {
  const db = getDb();
  // Trigger migration execution across all files in migrations/
  await db.get('SELECT 1');
  console.log('Database successfully migrated and seeded using existing migrations/ files!');
}

seed().catch(err => {
  console.error('Error running migrations/seeding:', err);
  process.exit(1);
});
