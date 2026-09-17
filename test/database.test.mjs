import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../database.js';

before(async () => {
  await db.initDatabase();
  await db.initDatabase(); // le migrazioni devono poter girare due volte
  await db.exec("INSERT INTO fornitori (ragione_sociale, partita_iva) VALUES ('Fornitore', '12345678901')");
  await db.exec("INSERT INTO prodotti (denominazione) VALUES ('Polpa')");
});

const carico = (extra = {}) => db.registraCarico({
  prodotto_id: 1, fornitore_id: 1, numero_lotto: 'L1', data_ricevimento: new Date().toISOString(),
  quantita: 5, unita_misura: 'kg', colli: 2, integrita_imballo: true, conformita_etichettatura: true, ...extra,
});

test('carico e scarico aggiornano la giacenza', async () => {
  const id = await carico();
  await db.registraScarico(id, 2, 'consumo');
  const l = await db.queryOne('SELECT * FROM lotti WHERE id = ?', [id]);
  assert.equal(l.quantita_residua, 3);
  assert.equal(l.colli, 2);
});

test('correzione del carico lascia traccia e ricalcola la giacenza', async () => {
  const id = await carico();
  await db.registraScarico(id, 1, 'consumo');
  const n = await db.correggiRecord('lotti', id, { numero_lotto: 'L2', quantita_iniziale: 6 });
  assert.equal(n, 2);
  const l = await db.queryOne('SELECT * FROM lotti WHERE id = ?', [id]);
  assert.equal(l.quantita_residua, 5);
  assert.match(l.note, /lotto era L1/);
  assert.equal((await db.correzioniRecord('lotti', id)).length, 2);
  await assert.rejects(db.correggiRecord('lotti', id, { quantita_iniziale: 0.5 }), /già usciti/);
});

test('correzione di un’uscita e blocco dell’annullamento', async () => {
  const id = await carico();
  await db.registraScarico(id, 1, 'consumo');
  const m = await db.queryOne("SELECT id FROM movimenti WHERE lotto_id = ? AND tipo = 'scarico'", [id]);
  await db.correggiUscita(m.id, 3);
  assert.equal((await db.queryOne('SELECT quantita_residua q FROM lotti WHERE id = ?', [id])).q, 2);
  await assert.rejects(db.correggiUscita(m.id, 9), /non puoi scaricarne/);
  await assert.rejects(db.annullaCarico(id), /già uscite/);
  const id2 = await carico();
  await db.annullaCarico(id2, 'errore');
  assert.equal((await db.queryOne('SELECT stato FROM lotti WHERE id = ?', [id2])).stato, 'annullato');
});

test('importazione fattura: tutto o niente, abbinamenti ricordati, doppione rilevato', async () => {
  const riga = (codice, extra = {}) => ({
    chiave: `cod:${codice}`, descrizione: `ART ${codice}`, prodotto_id: null, nuovo_prodotto: `Articolo ${codice}`,
    quantita: 2, unita_misura: 'kg', colli: 1, prezzo_unitario: 1, numero_lotto: 'FT 1', data_scadenza: null, note: 'x', ...extra,
  });
  const base = { fornitore_id: 1, numero: '77', data: '2026-09-15', totale: 10, integrita_imballo: true, conformita_etichettatura: true };
  const prima = (await db.queryOne('SELECT COUNT(*) n FROM lotti')).n;
  await assert.rejects(db.importaFattura({ ...base, righe: [riga('1'), riga('2', { prodotto_id: 9999 })] }));
  assert.equal((await db.queryOne('SELECT COUNT(*) n FROM lotti')).n, prima, 'nessun lotto parziale dopo un errore');

  assert.equal(await db.importaFattura({ ...base, righe: [riga('1'), riga('2')] }), 2);
  const abb = await db.abbinamentiFornitore(1);
  assert.ok(abb['cod:1'] && abb['cod:2']);
  assert.ok(await db.fatturaGiaImportata(1, '77', '2026-09-15'));
  assert.equal((await db.fornitoreDaPartiteIva(['12345678901'])).id, 1);
});

test('backup e ripristino completo, anche con chiavi esterne', async () => {
  await db.salvaPreferenza('backup_cartella', 'content://x');
  const dump = await db.esportaTutto();
  assert.ok(!('preferenze' in dump.tabelle), 'le preferenze del dispositivo non vanno nel backup');
  const lotti = (await db.queryOne('SELECT COUNT(*) n FROM lotti')).n;
  await db.exec("INSERT INTO fornitori (ragione_sociale) VALUES ('Da cancellare')");
  await db.importaTutto(dump);
  assert.equal((await db.queryOne('SELECT COUNT(*) n FROM lotti')).n, lotti);
  assert.equal((await db.queryOne("SELECT COUNT(*) n FROM fornitori WHERE ragione_sociale = 'Da cancellare'")).n, 0);
  assert.equal(await db.leggiPreferenza('backup_cartella'), 'content://x');
  await assert.rejects(db.importaTutto({ tabelle: { lotti: [{ id: 999, prodotto_id: 555, fornitore_id: 555, data_ricevimento: 'x', quantita_iniziale: 1, quantita_residua: 1 }] } }), /incoerente/);
  assert.equal((await db.queryOne('SELECT COUNT(*) n FROM lotti')).n, lotti, 'un backup rifiutato non tocca i dati');
});
