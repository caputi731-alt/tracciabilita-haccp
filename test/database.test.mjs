import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../database.js';
import { oggiLocale, piuGiorni, giornoDi } from '../utile.js';

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

/* ---------- giacenze, produzioni, temperature flessibili, giorni locali ---------- */

test('scarico: mai più della giacenza, neanche con un doppio tocco; annulla riporta la quantità giusta', async () => {
  const id = await carico({ quantita: 2 });
  const [a, b] = await Promise.allSettled([db.registraScarico(id, 2, 'consumo'), db.registraScarico(id, 2, 'consumo')]);
  assert.equal([a, b].filter((x) => x.status === 'fulfilled').length, 1, 'uno solo dei due scarichi contemporanei passa');
  const riuscito = [a, b].find((x) => x.status === 'fulfilled').value;
  await db.annullaUscita(riuscito);
  const l = await db.queryOne('SELECT quantita_residua, stato FROM lotti WHERE id = ?', [id]);
  assert.deepEqual([l.quantita_residua, l.stato], [2, 'disponibile']);
  await assert.rejects(db.registraScarico(id, 0, 'consumo'), /maggiore di zero/);
  await assert.rejects(db.registraScarico(id, NaN, 'consumo'), /maggiore di zero/);
});

test('lotti scaduti: non proposti alle produzioni, non usabili come consumo, scartabili', async () => {
  const pid = (await db.exec("INSERT INTO prodotti (denominazione, allergeni) VALUES ('Panna', '[\"Latte\"]')")).lastInsertRowId;
  const scaduto = await carico({ prodotto_id: pid, quantita: 3, data_scadenza: '2020-01-01' });
  const buono = await carico({ prodotto_id: pid, quantita: 3, data_scadenza: '2099-01-01' });
  assert.deepEqual((await db.lottiDisponibiliProdotto(pid)).map((l) => l.id), [buono]);
  assert.deepEqual((await db.lottiScadutiProdotto(pid)).map((l) => l.id), [scaduto]);
  await assert.rejects(db.registraScarico(scaduto, 1, 'consumo'), /scaduto/);
  await assert.rejects(db.registraProduzione({ nome: 'X' }, [{ lotto_id: scaduto, quantita: 1 }]), /scaduto/);
  await db.registraScarico(scaduto, 3, 'scarto');
  assert.equal((await db.queryOne('SELECT stato FROM lotti WHERE id = ?', [scaduto])).stato, 'esaurito');
});

test('produzione: quantità non valida o eccessiva rifiutata senza salvare nulla; allergeni salvati; annullamento', async () => {
  const pid = (await db.exec("INSERT INTO prodotti (denominazione, allergeni) VALUES ('Burro', '[\"Latte\"]')")).lastInsertRowId;
  const lotto = await carico({ prodotto_id: pid, quantita: 2 });
  const prima = (await db.listaProduzioni()).length;
  await assert.rejects(db.registraProduzione({ nome: 'Sugo' }, [{ lotto_id: lotto, quantita: Number('0,5') }]), /non valida/);
  await assert.rejects(db.registraProduzione({ nome: 'Sugo' }, [{ lotto_id: lotto, quantita: 50 }]), /restano solo 2/);
  assert.equal((await db.listaProduzioni()).length, prima, 'nessuna produzione salvata a metà');
  assert.equal((await db.queryOne('SELECT quantita_residua q FROM lotti WHERE id = ?', [lotto])).q, 2);

  const pr = await db.registraProduzione({ nome: 'Sugo' }, [{ lotto_id: lotto, quantita: 0.5 }]);
  assert.deepEqual(JSON.parse((await db.getProduzione(pr)).allergeni), ['Latte']);
  assert.equal((await db.queryOne('SELECT quantita_residua q FROM lotti WHERE id = ?', [lotto])).q, 1.5);
  await db.annullaProduzione(pr, 'prova');
  assert.equal((await db.queryOne('SELECT quantita_residua q FROM lotti WHERE id = ?', [lotto])).q, 2);
  assert.equal((await db.movimentiDiLotto(lotto)).filter((m) => m.tipo !== 'carico').length, 0);
  assert.equal((await db.produzioniDaLotto(lotto)).length, 0);
  assert.equal((await db.getProduzione(pr)).annullata, 1);
  await assert.rejects(db.annullaProduzione(pr), /già annullata/);
});

test('temperature: più rilevazioni al giorno, giorni passati annotati, niente giorni futuri', async () => {
  const punto = (await db.salvaPuntoControllo({ nome: 'Frigo prova', tipo: 'frigorifero', temp_min: 0, temp_max: 4 })).lastInsertRowId;
  const oggi = oggiLocale();
  const ieri = piuGiorni(oggi, -1);
  await db.registraTemperatura(punto, 3, null);
  await db.registraTemperatura(punto, 3.5, null);
  assert.equal((await db.temperatureDelGiorno(oggi)).filter((r) => r.punto_controllo_id === punto).length, 2);

  const r = await db.registraTemperatura(punto, 9, null, ieri);
  const diIeri = (await db.temperatureDelGiorno(ieri)).filter((x) => x.punto_controllo_id === punto);
  assert.equal(diIeri.length, 1);
  assert.match(diIeri[0].note, /Registrata in ritardo/);
  assert.equal(giornoDi(diIeri[0].data_ora), ieri);
  const nc = await db.queryOne('SELECT * FROM non_conformita WHERE temperatura_id = ?', [r.id]);
  assert.equal(nc.stato, 'aperta');

  // correzione: la non conformità collegata si chiude, resta la traccia
  await db.modificaTemperatura(r.id, 3);
  assert.equal((await db.queryOne('SELECT stato FROM non_conformita WHERE id = ?', [nc.id])).stato, 'chiusa');
  assert.equal((await db.correzioniRecord('registro_temperature', r.id)).length, 1);

  await assert.rejects(db.registraTemperatura(punto, 3, null, piuGiorni(oggi, 1)), /futuri/);
  await assert.rejects(db.registraTemperatura(punto, NaN, null), /non valida/);

  const sit = await db.situazioneTemperature(3);
  assert.deepEqual(sit.map((g) => g.giorno), [piuGiorni(oggi, -2), ieri, oggi]);
  assert.ok(sit[2].fatti >= 1 && sit[0].fatti === 0);
  const buchi = await db.giorniSenzaTemperature(piuGiorni(oggi, -2), oggi);
  assert.ok(buchi.some((b) => b.giorno === piuGiorni(oggi, -2)));
});

test('ricevimento: temperatura fuori dai limiti del prodotto apre una non conformità', async () => {
  const pid = (await db.exec("INSERT INTO prodotti (denominazione, temp_min, temp_max) VALUES ('Pesce fresco', 0, 4)")).lastInsertRowId;
  const id = await carico({ prodotto_id: pid, temperatura_rilevata: 9 });
  assert.equal((await db.queryOne('SELECT esito_controllo e FROM lotti WHERE id = ?', [id])).e, 'non conforme');
  const nc = await db.queryOne("SELECT * FROM non_conformita WHERE lotto_id = ? AND origine = 'ricevimento'", [id]);
  assert.match(nc.descrizione, /9°C al ricevimento/);
});

test('pulizie: "da fare" rispetta la frequenza dell\'area', async () => {
  const sett = (await db.salvaArea({ nome: 'Cappa prova', frequenza: 'settimanale' })).lastInsertRowId;
  const gior = (await db.salvaArea({ nome: 'Piano prova', frequenza: 'giornaliera' })).lastInsertRowId;
  const treGiorniFa = new Date(Date.now() - 3 * 86400000).toISOString();
  await db.exec('INSERT INTO registro_sanificazione (area_id, data_ora) VALUES (?,?), (?,?)', [sett, treGiorniFa, gior, treGiorniFa]);
  const stato = await db.areeConStato();
  assert.equal(stato.find((a) => a.id === sett).daFare, false, 'settimanale fatta 3 giorni fa: a posto');
  assert.equal(stato.find((a) => a.id === gior).daFare, true, 'giornaliera fatta 3 giorni fa: da fare');
});

test('archivio del modulo Menù: lettura, scrittura a gruppi, cancellazione', async () => {
  assert.equal(await db.menuLeggi('state'), null);
  await db.menuScrivi([['state', '{"v":3}'], ['blob:a', '"data:image/png;base64,AAAA"']]);
  assert.equal(await db.menuLeggi('state'), '{"v":3}');
  assert.deepEqual(await db.menuChiavi(), ['blob:a', 'state']);
  await db.menuScrivi([['state', '{"v":3,"menus":[1]}'], ['blob:a', null]]);
  assert.equal(await db.menuLeggi('state'), '{"v":3,"menus":[1]}');
  assert.deepEqual(await db.menuChiavi(), ['state']);
  // un gruppo con un dato non valido non scrive niente
  await assert.rejects(db.menuScrivi([['state', '{"v":0}'], ['x', { oggetto: true }]]), /non validi/);
  assert.equal(await db.menuLeggi('state'), '{"v":3,"menus":[1]}');
});

test('i dati del Menù entrano nel backup e un backup vecchio non li cancella', async () => {
  await db.menuScrivi([['state', '{"v":3,"menus":["a"]}']]);
  const dump = await db.esportaTutto();
  assert.deepEqual(dump.tabelle.menu_dati.map((r) => ({ ...r })), [{ chiave: 'state', valore: '{"v":3,"menus":["a"]}' }]);
  await db.menuScrivi([['state', '{"v":3,"menus":["a","b"]}']]);
  await db.importaTutto(dump);
  assert.equal(await db.menuLeggi('state'), '{"v":3,"menus":["a"]}', 'il ripristino riporta i menù del backup');
  // backup fatto prima del modulo Menù: non ha la tabella, i menù attuali restano
  const vecchio = { ...dump, tabelle: { ...dump.tabelle } };
  delete vecchio.tabelle.menu_dati;
  await db.menuScrivi([['state', '{"v":3,"menus":["nuovo"]}']]);
  await db.importaTutto(vecchio);
  assert.equal(await db.menuLeggi('state'), '{"v":3,"menus":["nuovo"]}');
});
