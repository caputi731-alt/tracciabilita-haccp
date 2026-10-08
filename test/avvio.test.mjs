import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../database.js';

// Su un telefono già in uso, la versione nuova deve aggiungere le sue colonne anche se l'avvio del database
// parte due volte insieme (è successo con la build 77: "duplicate column name: creato_il" e app ferma).
test('avvio del database partito due volte insieme: le colonne nuove si aggiungono una volta sola', async () => {
  await Promise.all([db.initDatabase(), db.initDatabase(), db.initDatabase()]);
  const colonne = (await db.query('PRAGMA table_info(movimenti)')).map((c) => c.name);
  assert.equal(colonne.filter((c) => c === 'creato_il').length, 1);
  await db.initDatabase();
  assert.ok((await db.query('PRAGMA table_info(registro_temperature)')).some((c) => c.name === 'creato_il'));
});
