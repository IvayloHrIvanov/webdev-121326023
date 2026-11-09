import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let dbInstance = null;

export function getDb() {
  if (!dbInstance) {
    const sqlite = new Database('./database.db');

    const migrationsDir = path.join(__dirname, '../../migrations');
    if (fs.existsSync(migrationsDir)) {
      const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
      sqlite.exec('PRAGMA foreign_keys = OFF;');
      for (const file of files) {
        const filePath = path.join(migrationsDir, file);
        const migrationSql = fs.readFileSync(filePath, 'utf8');
        // Split by statement or execute block. Better-sqlite3 can execute multiple statements.
        // For ALTER TABLE statements that might fail if column exists, we can run them statement by statement or catch errors.
        const statements = migrationSql.split(';');
        for (const stmt of statements) {
          const trimmed = stmt.trim();
          if (!trimmed) continue;
          try {
            sqlite.exec(trimmed);
          } catch (err) {
            // Ignore duplicate column errors or table already exists errors for idempotency
            if (!err.message.includes('duplicate column name') && !err.message.includes('already exists')) {
              console.error(`Migration error in ${file} for statement "${trimmed}":`, err.message);
            }
          }
        }
      }
      sqlite.exec('PRAGMA foreign_keys = ON;');
    }

    dbInstance = {
      get: (sql, params = []) => sqlite.prepare(sql).get(...params),
      all: (sql, params = []) => sqlite.prepare(sql).all(...params),
      run: (sql, params = []) => {
        const info = sqlite.prepare(sql).run(...params);
        return { lastID: info.lastInsertRowid, changes: info.changes };
      }
    };
  }
  return dbInstance;
}
