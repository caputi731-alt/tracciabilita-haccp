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

test('foto del lotto: aggiunta, sostituzione con traccia ed elenco', async () => {
  const id = await carico({ foto_etichetta: 'file:///cache/vecchia.jpg' });
  await db.impostaFotoLotto(id, 'foto_etichetta', 'file:///foto/etichetta-1.jpg');
  const l = await db.queryOne('SELECT foto_etichetta FROM lotti WHERE id = ?', [id]);
  assert.equal(l.foto_etichetta, 'file:///foto/etichetta-1.jpg');
  const tracce = await db.correzioniRecord('lotti', id);
  assert.equal(tracce[0].valore_precedente, 'file:///cache/vecchia.jpg');
  await assert.rejects(db.impostaFotoLotto(id, 'note', 'x'), /non valido/);
  assert.ok((await db.fotoDeiLotti()).some((f) => f.id === id && f.campo === 'foto_etichetta'));
  await db.aggiornaIndirizzoFoto('file:///foto/etichetta-1.jpg', 'file:///nuova/etichetta-1.jpg');
  assert.equal((await db.queryOne('SELECT foto_etichetta f FROM lotti WHERE id = ?', [id])).f, 'file:///nuova/etichetta-1.jpg');
});

test('ricette e produzioni: salvataggio e collegamento ai lotti (schema corretto)', async () => {
  const pid = (await db.exec("INSERT INTO prodotti (denominazione, allergeni, allergeni_verificati) VALUES ('Farina', '[\"Glutine\"]', 1)")).lastInsertRowId;
  const uid = (await db.exec("INSERT INTO prodotti (denominazione, allergeni) VALUES ('Uova sfuse', '[\"Uova\"]')")).lastInsertRowId;
  const rid = await db.salvaRicetta({ nome: 'Tagliatelle', categoria: 'Primi', porzioni: 4, ingredienti: [{ prodotto_id: pid, quantita: 1 }, { prodotto_id: uid, quantita: 2 }] });
  assert.ok((await db.listaRicette()).some((r) => r.id === rid));
  const lotto = await carico({ prodotto_id: pid, numero_lotto: 'FAR1' });
  const prod = await db.registraProduzione({ ricetta_id: rid, nome: 'Tagliatelle', lotto_produzione: 'P1' }, [{ lotto_id: lotto, quantita: 1 }]);
  const dett = await db.getProduzione(prod);
  assert.equal(dett.nome, 'Tagliatelle');
  assert.equal(dett.lotti.length, 1);

  const tab = await db.tabellaAllergeni();
  const t = tab.find((x) => x.id === rid);
  assert.deepEqual(t.allergeni.sort(), ['Glutine', 'Uova']);
  assert.deepEqual(t.fonti.Uova, ['Uova sfuse']);
  assert.deepEqual(t.daVerificare, ['Uova sfuse']);
  assert.ok((await db.prodottiDaCompletare()).some((p) => p.id === uid));
});

test('richiamo: blocco, esclusione dal magazzino, impatto sui piatti, sblocco', async () => {
  const pid = (await db.exec("INSERT INTO prodotti (denominazione) VALUES ('Mascarpone')")).lastInsertRowId;
  const rid = await db.salvaRicetta({ nome: 'Tiramisù', ingredienti: [{ prodotto_id: pid, quantita: 1 }] });
  const a = await carico({ prodotto_id: pid, numero_lotto: 'M77' });
  const b = await carico({ prodotto_id: pid, numero_lotto: 'M77' });
  await db.registraProduzione({ ricetta_id: rid, nome: 'Tiramisù', lotto_produzione: 'T1' }, [{ lotto_id: a, quantita: 1 }]);

  await assert.rejects(db.bloccaLotto(a, ''), /motivo/);
  await db.bloccaLotto(a, 'Richiamo del fornitore');
  assert.ok(!(await db.listaLotti('')).some((l) => l.id === a), 'il lotto bloccato non è più utilizzabile');
  assert.ok(!(await db.lottiDisponibiliProdotto(pid)).some((l) => l.id === a));
  assert.ok((await db.lottiBloccati()).some((l) => l.id === a));
  const nc = await db.queryOne("SELECT * FROM non_conformita WHERE origine = 'richiamo' AND lotto_id = ?", [a]);
  assert.match(nc.descrizione, /M77/);

  const imp = await db.impattoLotto(a);
  assert.deepEqual(imp.piatti.map((p) => p.lotto_produzione), ['T1']);
  assert.deepEqual(imp.stessaPartita.map((l) => l.id), [b]);
  assert.equal(imp.usato, 1);

  await db.registraScarico(a, 1, 'reso');
  assert.equal((await db.queryOne('SELECT stato FROM lotti WHERE id = ?', [a])).stato, 'bloccato', 'un reso non sblocca il lotto');
  await assert.rejects(db.registraProduzione({ nome: 'X' }, [{ lotto_id: a, quantita: 1 }]), /bloccato/);

  await db.sbloccaLotto(a, 'Verificato: lotto non coinvolto');
  assert.equal((await db.queryOne('SELECT stato FROM lotti WHERE id = ?', [a])).stato, 'disponibile');
});

test('foto etichetta sulla scheda prodotto: dal ricevimento, dalle fatture e a mano', async () => {
  const pid = (await db.exec("INSERT INTO prodotti (denominazione) VALUES ('Grana')")).lastInsertRowId;
  assert.equal(await db.impostaFotoProdotto(pid, 'file:///foto/a.jpg', true), true);
  assert.equal(await db.impostaFotoProdotto(pid, 'file:///foto/b.jpg', true), false, 'non sovrascrive una foto già presente');
  assert.equal((await db.queryOne('SELECT foto_etichetta f FROM prodotti WHERE id = ?', [pid])).f, 'file:///foto/a.jpg');
  assert.equal(await db.impostaFotoProdotto(pid, 'file:///foto/b.jpg'), true, 'dalla scheda prodotto si sostituisce');

  // import fattura: la foto della riga diventa anche la foto del prodotto nuovo
  await db.importaFattura({
    fornitore_id: 1, numero: '90', data: '2026-09-17', integrita_imballo: true, conformita_etichettatura: true,
    righe: [{ chiave: 'cod:99', descrizione: 'ART 99', prodotto_id: null, nuovo_prodotto: 'Articolo 99',
      quantita: 1, unita_misura: 'kg', numero_lotto: 'FT90', foto_etichetta: 'file:///foto/c.jpg' }],
  });
  const nuovo = await db.queryOne("SELECT * FROM prodotti WHERE denominazione = 'Articolo 99'");
  assert.equal(nuovo.foto_etichetta, 'file:///foto/c.jpg');
  assert.equal((await db.queryOne("SELECT foto_etichetta f FROM lotti WHERE numero_lotto = 'FT90'")).f, 'file:///foto/c.jpg');

  const salvato = await db.salvaProdotto({ denominazione: 'Con foto', allergeni: [], foto_etichetta: 'file:///foto/d.jpg' });
  assert.ok(salvato);
  assert.equal((await db.queryOne("SELECT foto_etichetta f FROM prodotti WHERE denominazione = 'Con foto'")).f, 'file:///foto/d.jpg');
});

test('annulla subito: scarico, temperatura (con la sua non conformità) e pulizia', async () => {
  const id = await carico({ quantita: 5 });
  const mov = await db.registraScarico(id, 5, 'consumo');
  assert.equal((await db.queryOne('SELECT stato FROM lotti WHERE id = ?', [id])).stato, 'esaurito');
  await db.annullaUscita(mov);
  const l = await db.queryOne('SELECT stato, quantita_residua q FROM lotti WHERE id = ?', [id]);
  assert.deepEqual([l.stato, l.q], ['disponibile', 5]);
  assert.equal((await db.queryOne('SELECT COUNT(*) n FROM movimenti WHERE id = ?', [mov])).n, 0);

  const pc = (await db.exec("INSERT INTO punti_controllo (nome, tipo, temp_min, temp_max) VALUES ('Frigo 1', 'frigorifero', 0, 4)")).lastInsertRowId;
  const ok = await db.registraTemperatura(pc, 3, null);
  assert.equal(ok.conforme, true);
  const ko = await db.registraTemperatura(pc, 9, null);
  assert.equal(ko.conforme, false);
  assert.ok(ko.ncId);
  await db.annullaTemperatura(ko.id, ko.ncId);
  assert.equal((await db.queryOne('SELECT COUNT(*) n FROM non_conformita WHERE id = ?', [ko.ncId])).n, 0);
  assert.equal((await db.queryOne('SELECT COUNT(*) n FROM registro_temperature WHERE id = ?', [ko.id])).n, 0);

  const s = await db.registraSanificazione({ area_id: null, prodotto_utilizzato: 'x', operatore: 'L', note: null });
  await db.annullaSanificazione(s);
  assert.equal((await db.queryOne('SELECT COUNT(*) n FROM registro_sanificazione WHERE id = ?', [s])).n, 0);
  assert.ok((await db.query("SELECT * FROM registro_modifiche WHERE campo = 'annullato'")).length >= 3);
});
