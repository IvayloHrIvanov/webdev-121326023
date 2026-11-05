import Database from 'better-sqlite3';

let dbInstance = null;

export function getDb() {
  if (!dbInstance) {
    const sqlite = new Database('./database.db');
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
