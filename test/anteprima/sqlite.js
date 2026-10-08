// Solo per l'anteprima nel browser (non entra nell'APK): expo-sqlite su sql.js in memoria.
// Se la pagina definisce window.__SEME (SQL), viene eseguito una volta dopo la creazione delle tabelle.
const initSqlJs = require('sql.js/dist/sql-asm.js');
let pronto = null;
export async function openDatabaseAsync() {
  if (!pronto) pronto = initSqlJs().then((SQL) => new SQL.Database());
  const db = await pronto;
  let schema = false; let seminato = false;
  const semina = () => { if (schema && !seminato && typeof window !== 'undefined' && window.__SEME) { seminato = true; try { db.exec(window.__SEME); } catch (e) { console.error('seme: ' + e.message); } } };
  const norm = (p) => (p || []).map((x) => (x === undefined ? null : typeof x === 'boolean' ? (x ? 1 : 0) : x));
  const tutte = (sql, p) => { semina(); const st = db.prepare(sql); st.bind(norm(p)); const r = []; while (st.step()) r.push(st.getAsObject()); st.free(); return r; };
  return {
    execAsync: async (sql) => { db.exec(sql); if (/CREATE TABLE IF NOT EXISTS menu_dati/.test(sql)) schema = true; },
    getAllAsync: async (sql, p) => tutte(sql, p),
    getFirstAsync: async (sql, p) => tutte(sql, p)[0] ?? null,
    runAsync: async (sql, p) => { semina(); db.run(sql, norm(p)); const id = tutte('SELECT last_insert_rowid() AS id')[0].id; return { lastInsertRowId: id, changes: db.getRowsModified() }; },
    withTransactionAsync: async (fn) => { db.exec('BEGIN'); try { await fn(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } },
  };
}
