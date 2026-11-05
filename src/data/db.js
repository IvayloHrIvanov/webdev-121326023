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
    
    const schemaPath = path.join(__dirname, '../../migrations/001_initial_schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf8');
      sqlite.exec('PRAGMA foreign_keys = OFF;');
      sqlite.exec(schema);
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
