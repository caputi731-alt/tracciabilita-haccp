// Sostituto di expo-sqlite per i test: stessa API asincrona usata dall'app, su node:sqlite in memoria.
import { DatabaseSync } from 'node:sqlite';

export async function openDatabaseAsync() {
  const db = new DatabaseSync(':memory:');
  const norm = (p) => p.map((x) => (x === undefined ? null : typeof x === 'boolean' ? (x ? 1 : 0) : x));
  return {
    execAsync: async (sql) => { db.exec(sql); },
    getAllAsync: async (sql, p = []) => db.prepare(sql).all(...norm(p)),
    getFirstAsync: async (sql, p = []) => db.prepare(sql).get(...norm(p)) ?? null,
    runAsync: async (sql, p = []) => {
      const r = db.prepare(sql).run(...norm(p));
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: r.changes };
    },
    withTransactionAsync: async (fn) => {
      db.exec('BEGIN');
      try { await fn(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}
