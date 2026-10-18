// Prenotazioni da Family Wall: lettura del file iCal, lettura del testo con le regole di Luca, confronto con quanto già salvato,
// messa a tavola, scaricamento (familywall.js) e salvataggio nel database (database.js). Nomi e telefoni sono inventati.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  leggiIcs, giornoIcs, eVerde, leggiTesto, trovaTelefono, noteTavolata, confronta, mettiATavola, togliTavolata, linkValido, scaricaCalendario,
} from '../familywall.js';
import { SALE, nuovaTavolata, trova, totali } from '../sale.js';
import * as db from '../database.js';
import { aggiornaDaFamilyWall } from '../familywallAggiorna.js';
import { oggiLocale, piuGiorni } from '../utile.js';

const ics = (eventi) => [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//prova//IT',
  ...eventi.flatMap((e) => ['BEGIN:VEVENT', ...e, 'END:VEVENT']),
  'END:VCALENDAR', '',
].join('\r\n');

test('iCal: giorno, testo, colore, righe spezzate, eventi annullati', () => {
  const testo = ics([
    ['UID:a1', 'DTSTART;VALUE=DATE:20261025', 'SUMMARY:Rossi 8 cop 3471112223'],
    ['UID:a2', 'DTSTART;TZID=Europe/Rome:20261026T130000', 'SUMMARY:Bianchi 5+1\\, seggiolone', 'COLOR:green',
      'DESCRIPTION:prima riga\\nseconda', '  riga'],
    ['UID:a3', 'DTSTART:20261027T120000Z', 'SUMMARY:Verdi 4', 'STATUS:CANCELLED'],
    ['UID:a4', 'DTSTART:20261028T230000Z', 'SUMMARY:Neri 2'],
  ]);
  const ev = leggiIcs(testo);
  assert.equal(ev.length, 3);
  assert.deepEqual(ev[0], { uid: 'a1', data: '2026-10-25', titolo: 'Rossi 8 cop 3471112223', descrizione: '', colore: '' });
  assert.equal(ev[1].data, '2026-10-26');
  assert.equal(ev[1].titolo, 'Bianchi 5+1, seggiolone');
  assert.equal(ev[1].descrizione, 'prima riga\nseconda riga');
  assert.equal(ev[1].colore, 'green');
  // 23:00 UTC del 28 è già il 29 in Italia
  assert.equal(ev[2].data, '2026-10-29');
  assert.equal(giornoIcs('20261025'), '2026-10-25');
  assert.equal(giornoIcs('boh'), null);
});

test('verde = acconto ricevuto', () => {
  assert.ok(eVerde('green'));
  assert.ok(eVerde('#2E9E4F'));
  assert.ok(eVerde('#1b8a3aff'));
  assert.ok(!eVerde('#4A86E8')); // l'azzurro degli altri eventi
  assert.ok(!eVerde(''));
});

test('telefono: cellulare attaccato a "cop", con spazi, estero; non i coperti', () => {
  assert.equal(trovaTelefono('Rossi 8 cop3471112223').tel, '3471112223');
  assert.equal(trovaTelefono('Antonio 6+2 347 123 4567').tel, '3471234567');
  assert.equal(trovaTelefono('Gialli 13/16 +41781112233').tel, '+41781112233');
  assert.equal(trovaTelefono('Rossi 30 3471234567').tel, '3471234567');
  assert.equal(trovaTelefono('Mori 10+1 3471234567').tel, '3471234567'); // "+1 347…" non è un numero estero
  assert.equal(trovaTelefono('Strignano 9+2+1'), null);
});

test('testo: le regole di Luca sugli esempi del calendario', () => {
  const a = leggiTesto('Pino di Paolo 8 cop3471112223');
  assert.equal(a.nome, 'Pino di Paolo');
  assert.equal(a.persone, 8);
  assert.equal(a.telefono, '3471112223');
  assert.deepEqual(a.incerti, []);

  const b = leggiTesto('Marini 5-1(8anni) A.S. cell 3470001112');
  assert.deepEqual([b.nome, b.adulti, b.bambini, b.persone, b.sala], ['Marini', 5, 1, 6, 'stalla']);
  assert.deepEqual(b.eta, ['8 anni']);
  assert.equal(b.note, '');

  const c = leggiTesto('Sardo 13/16 +41781112233');
  assert.deepEqual([c.min, c.max, c.persone], [13, 16, 16]);
  assert.equal(c.telefono, '+41781112233');

  const d = leggiTesto('Ferri 9+2+1 1( menù vegetariano) 3331234567');
  assert.deepEqual([d.adulti, d.bambini, d.neonati, d.persone], [9, 2, 1, 12]);
  assert.equal(d.note, '1 (menù vegetariano)');

  const e = leggiTesto('Antonio 6+2 cop Portano una Torta 347 123 4567');
  assert.deepEqual([e.nome, e.persone, e.note, e.telefono], ['Antonio', 8, 'Portano una Torta', '3471234567']);

  const f = leggiTesto('Messi 10+1 (potrebbe non fare il menù)', '', '#2E9E4F');
  assert.equal(f.persone, 11);
  assert.ok(f.acconto);
  assert.equal(f.note, '(potrebbe non fare il menù)');
});

test('testo: sala panoramica, cena, acconto scritto, eventi che non sono prenotazioni', () => {
  const a = leggiTesto('S.P. Rossi 4 cena');
  assert.deepEqual([a.nome, a.persone, a.sala, a.servizio], ['Rossi', 4, 'panoramica', 'Cena']);
  assert.ok(a.incerti.includes('servizio'));
  const b = leggiTesto('Bianchi 30 3471234567 acc 100');
  assert.equal(b.persone, 30);
  assert.ok(b.acconto);
  assert.deepEqual(b.incerti, []); // "100" è l'acconto, non le persone
  const c = leggiTesto('Compleanno della nonna');
  assert.equal(c.prenotazione, false);
  assert.ok(c.incerti.includes('persone'));
  const d = leggiTesto('Verdi', 'Sono 7, telefono 3471234567');
  assert.equal(d.persone, 7);
  assert.equal(d.telefono, '3471234567');
  assert.equal(leggiTesto('Gallo 4').servizio, 'Pranzo');
  assert.equal(leggiTesto('Sas 4').sala, null); // "sas" non è la sigla di una sala
});

test('note della tavolata', () => {
  assert.equal(noteTavolata(leggiTesto('Marini 5-1(8anni) 3470001112')), '5 adulti, 1 bambino (8 anni) · Tel 3470001112');
  assert.equal(noteTavolata(leggiTesto('Sardo 13/16')), 'da 13 a 16 persone');
  assert.equal(noteTavolata({ ...leggiTesto('Rossi 4'), acconto: true }), 'Acconto ricevuto');
});

test('confronto: nuove, cambiate, sparite; nulla di confermato si cancella da solo', () => {
  const oggi = '2026-10-18';
  const ev = (uid, data, titolo) => ({ uid, data, titolo, descrizione: '', colore: '' });
  const righe = [
    { uid: 'n1', data: '2026-10-20', testo: 'Rossi 4', colore: '', stato: 'nuova' },
    { uid: 'n2', data: '2026-10-21', testo: 'Bianchi 6', colore: '', stato: 'nuova' },
    { uid: 'c1', data: '2026-10-22', testo: 'Verdi 8', colore: '', stato: 'confermata' },
    { uid: 'c2', data: '2026-10-23', testo: 'Neri 2', colore: '', stato: 'confermata' },
    { uid: 's1', data: '2026-10-24', testo: 'Compleanno', colore: '', stato: 'scartata' },
    { uid: 'p1', data: '2026-10-10', testo: 'Vecchia 3', colore: '', stato: 'nuova' },
    { uid: 'p2', data: '2026-10-11', testo: 'Fatta 3', colore: '', stato: 'confermata' },
  ];
  const r = confronta(righe, [
    ev('n1', '2026-10-20', 'Rossi 5'),       // cambiata, ancora da confermare
    ev('c1', '2026-10-22', 'Verdi 9'),       // cambiata dopo la conferma
    ev('s1', '2026-10-24', 'Compleanno'),    // uguale
    ev('x1', '2026-10-25', 'Nuova 3'),
    ev('x2', '2026-10-01', 'Passata 3'),     // giorno passato: non si importa
    ev('x3', '2029-01-01', 'Lontana 3'),     // oltre la finestra
  ], oggi);
  assert.deepEqual(r.inserisci.map((x) => x.uid), ['x1']);
  assert.equal(r.inserisci[0].stato, 'nuova');
  const agg = Object.fromEntries(r.aggiorna.map((x) => [x.uid, x]));
  assert.equal(agg.n1.testo, 'Rossi 5');
  assert.equal(agg.n1.stato, 'nuova');
  assert.equal(agg.c1.cambiata, 1);
  assert.equal(agg.c1.testo, 'Verdi 9');
  assert.equal(agg.c2.sparita, 1);
  assert.ok(!agg.s1);
  assert.deepEqual(r.elimina.sort(), ['n2', 'p1']);
  // la confermata del passato resta
  assert.ok(!r.elimina.includes('p2') && !agg.p2);
  // una prenotazione sparita che torna non è più segnalata
  const r2 = confronta([{ ...righe[3], sparita: 1 }], [ev('c2', '2026-10-23', 'Neri 2')], oggi);
  assert.deepEqual(r2.aggiorna, [{ uid: 'c2', sparita: 0 }]);
  // una scartata che cambia torna da confermare
  const r3 = confronta([righe[4]], [ev('s1', '2026-10-24', 'Compleanno Rossi 12')], oggi);
  assert.equal(r3.aggiorna[0].stato, 'nuova');
});

test('messa a tavola: nella sala indicata, altrimenti nell\'altra', () => {
  const t = nuovaTavolata({ nome: 'Rossi', persone: '8' });
  const a = mettiATavola(null, 'panoramica', t);
  assert.equal(a.sala, 'panoramica');
  assert.ok(trova(SALE.panoramica, a.piani.panoramica, t.id));
  const b = mettiATavola(a.piani, 'stalla', nuovaTavolata({ persone: '6' }));
  assert.equal(b.sala, 'stalla');
  assert.equal(totali([[SALE.stalla, b.piani.stalla], [SALE.panoramica, b.piani.panoramica]]).prenotate, 2);
  const c = togliTavolata(b.piani, t.id);
  assert.ok(!trova(SALE.panoramica, c.panoramica, t.id));
  // troppo lunga per qualunque fila
  assert.equal(mettiATavola(null, 'stalla', nuovaTavolata({ persone: '200', len: 14 })), null);
});

test('link: webcal diventa https, il resto viene rifiutato', () => {
  assert.equal(linkValido(' webcal://api.familywall.com/ical/abc '), 'https://api.familywall.com/ical/abc');
  assert.equal(linkValido('http://esempio.it/cal.ics'), 'https://esempio.it/cal.ics');
  assert.equal(linkValido('ciao'), null);
  assert.equal(linkValido('ftp://esempio.it/x'), null);
});

test('scaricamento: senza rete, link scaduto, pagina che non è un calendario', async () => {
  const risposta = (status, testo) => async () => ({ ok: status === 200, status, text: async () => testo });
  assert.match(await scaricaCalendario('https://x.it/c', { fetchFn: risposta(200, ics([])) }), /VCALENDAR/);
  await assert.rejects(scaricaCalendario('https://x.it/c', { fetchFn: async () => { throw new Error('rete'); } }), /Nessuna connessione/);
  await assert.rejects(scaricaCalendario('https://x.it/c', { fetchFn: risposta(404, '') }), /generane uno nuovo/);
  await assert.rejects(scaricaCalendario('https://x.it/c', { fetchFn: risposta(200, '<html>') }), /non porta a un calendario/);
  await assert.rejects(scaricaCalendario('boh', { fetchFn: risposta(200, '') }), /non è valido/);
});

/* ---------- database ---------- */

const oggi = oggiLocale();
const giorno = (n) => piuGiorni(oggi, n);
const calendario = (eventi) => async () => ({ ok: true, status: 200, text: async () => ics(eventi) });
const dtstart = (n) => `DTSTART;VALUE=DATE:${giorno(n).replace(/-/g, '')}`;

test('database: aggiornamento, conferma a tavola, scarto, modifiche e prenotazioni sparite', async () => {
  await db.initDatabase();
  await db.initDatabase();
  // senza link non scarica niente
  await assert.rejects(aggiornaDaFamilyWall({ fetchFn: calendario([]) }), /Collega prima/);
  await db.salvaLinkFamilyWall('webcal://api.familywall.com/ical/prova');
  assert.equal(await db.leggiPreferenza('familywall_link'), 'https://api.familywall.com/ical/prova');

  const primo = await aggiornaDaFamilyWall({ fetchFn: calendario([
    ['UID:r1', dtstart(2), 'SUMMARY:Marini 5-1(8anni) A.S. 3470001112'],
    ['UID:r2', dtstart(2), 'SUMMARY:Compleanno nonna'],
    ['UID:r3', dtstart(3), 'SUMMARY:Sardo 13/16 S.P.'],
  ]) });
  assert.deepEqual(primo, { nuove: 3, cambiate: 0, sparite: 0 });
  assert.ok(await db.leggiPreferenza('familywall_ultimo'));
  let righe = await db.prenotazioniEsterne(oggi);
  assert.equal(righe.length, 3);
  assert.ok(righe.every((r) => r.stato === 'nuova'));

  // conferma: la tavolata va nella sala indicata, con le note composte
  const r1 = righe.find((r) => r.uid === 'r1');
  const t = nuovaTavolata({ nome: 'Marini', persone: '6', note: '5 adulti, 1 bambino (8 anni) · Tel 3470001112' });
  const esito = await db.confermaPrenotazioneEsterna(r1.uid, { data: r1.data, servizio: 'Pranzo', sala: 'stalla', tavolata: t });
  assert.equal(esito.sala, 'stalla');
  const piani = await db.disposizioneGiorno(giorno(2), 'Pranzo');
  const messa = trova(SALE.stalla, piani.stalla, t.id);
  assert.equal(messa.t.nome, 'Marini');
  assert.match(messa.t.note, /Tel 3470001112/);
  // non si conferma due volte
  await assert.rejects(db.confermaPrenotazioneEsterna(r1.uid, { data: r1.data, servizio: 'Pranzo', sala: 'stalla', tavolata: t }), /già/);

  await db.scartaPrenotazioneEsterna('r2');
  righe = await db.prenotazioniEsterne(oggi);
  assert.equal(righe.find((r) => r.uid === 'r2').stato, 'scartata');

  // in Family Wall: r1 cambia, r3 sparisce (era da confermare), r2 resta uguale
  const secondo = await aggiornaDaFamilyWall({ fetchFn: calendario([
    ['UID:r1', dtstart(2), 'SUMMARY:Marini 7 A.S. 3470001112'],
    ['UID:r2', dtstart(2), 'SUMMARY:Compleanno nonna'],
  ]) });
  assert.deepEqual(secondo, { nuove: 0, cambiate: 1, sparite: 0 });
  righe = await db.prenotazioniEsterne(oggi);
  assert.equal(righe.length, 2);
  const cambiata = righe.find((r) => r.uid === 'r1');
  assert.equal(cambiata.cambiata, 1);
  assert.equal(cambiata.stato, 'confermata');
  // "rifai la scheda": la tavolata vecchia si toglie e la prenotazione torna da confermare
  await db.rifaiPrenotazioneEsterna('r1');
  assert.ok(!trova(SALE.stalla, (await db.disposizioneGiorno(giorno(2), 'Pranzo')).stalla, t.id));
  righe = await db.prenotazioniEsterne(oggi);
  assert.equal(righe.find((r) => r.uid === 'r1').stato, 'nuova');
  assert.equal(righe.find((r) => r.uid === 'r1').cambiata, 0);

  // confermata e poi sparita da Family Wall: segnalata, la tavolata resta finché non si decide
  const t2 = nuovaTavolata({ nome: 'Marini', persone: '7' });
  await db.confermaPrenotazioneEsterna('r1', { data: giorno(2), servizio: 'Pranzo', sala: 'panoramica', tavolata: t2 });
  const terzo = await aggiornaDaFamilyWall({ fetchFn: calendario([['UID:r2', dtstart(2), 'SUMMARY:Compleanno nonna']]) });
  assert.deepEqual(terzo, { nuove: 0, cambiate: 0, sparite: 1 });
  assert.ok(trova(SALE.panoramica, (await db.disposizioneGiorno(giorno(2), 'Pranzo')).panoramica, t2.id));
  await db.togliPrenotazioneEsterna('r1');
  assert.ok(!trova(SALE.panoramica, (await db.disposizioneGiorno(giorno(2), 'Pranzo')).panoramica, t2.id));
  assert.ok(!(await db.prenotazioniEsterne(oggi)).some((r) => r.uid === 'r1'));

  // "lascia com'è" su una cambiata: la segnalazione sparisce, la tavolata resta
  await aggiornaDaFamilyWall({ fetchFn: calendario([['UID:r4', dtstart(4), 'SUMMARY:Gallo 4']]) });
  const t4 = nuovaTavolata({ nome: 'Gallo', persone: '4' });
  await db.confermaPrenotazioneEsterna('r4', { data: giorno(4), servizio: 'Pranzo', sala: 'stalla', tavolata: t4 });
  await aggiornaDaFamilyWall({ fetchFn: calendario([['UID:r4', dtstart(4), 'SUMMARY:Gallo 5']]) });
  await db.lasciaPrenotazioneEsterna('r4');
  const r4 = (await db.prenotazioniEsterne(oggi)).find((r) => r.uid === 'r4');
  assert.equal(r4.cambiata, 0);
  assert.ok(trova(SALE.stalla, (await db.disposizioneGiorno(giorno(4), 'Pranzo')).stalla, t4.id));
});

test('database: senza rete restano le prenotazioni già scaricate e l\'errore viene ricordato', async () => {
  await db.initDatabase();
  await db.salvaLinkFamilyWall('https://api.familywall.com/ical/prova');
  const prima = (await db.prenotazioniEsterne(oggi)).length;
  await assert.rejects(aggiornaDaFamilyWall({ fetchFn: async () => { throw new Error('rete'); } }), /Nessuna connessione/);
  assert.equal((await db.prenotazioniEsterne(oggi)).length, prima);
  assert.match(await db.leggiPreferenza('familywall_errore'), /Nessuna connessione/);
  await assert.rejects(db.salvaLinkFamilyWall('ciao'), /non è valido/);
});

test('database: le prenotazioni importate vanno nel backup, il link no', async () => {
  await db.initDatabase();
  const dump = await db.esportaTutto();
  assert.ok(Array.isArray(dump.tabelle.prenotazioni_esterne));
  assert.ok(!dump.tabelle.preferenze);
  // un backup di prima non svuota le prenotazioni importate
  const n = (await db.query('SELECT * FROM prenotazioni_esterne')).length;
  const vecchio = { ...dump, tabelle: { ...dump.tabelle } };
  delete vecchio.tabelle.prenotazioni_esterne;
  await db.importaTutto(vecchio);
  assert.equal((await db.query('SELECT * FROM prenotazioni_esterne')).length, n);
  // scollegare toglie il link e lo stato, non le prenotazioni
  await db.scollegaFamilyWall();
  assert.equal(await db.leggiPreferenza('familywall_link'), null);
  assert.equal((await db.query('SELECT * FROM prenotazioni_esterne')).length, n);
});

test('calendario: confermate in Sala (anche a mano) e da confermare, senza scartate né eventi senza persone', async () => {
  const { prenotazioniCalendario } = await import('../familywall.js');
  const { pianoVuoto } = await import('../sale.js');
  const piani = { stalla: pianoVuoto(SALE.stalla), panoramica: pianoVuoto(SALE.panoramica) };
  piani.stalla.file[0].push(nuovaTavolata({ nome: 'Rossi', persone: '8' }));
  piani.panoramica.file[0].push(nuovaTavolata({ nome: '', persone: '' })); // tavolata libera: non è una prenotazione
  const elenco = prenotazioniCalendario(
    [{ data: '2026-10-25', servizio: 'Pranzo', piani }],
    [
      { uid: 'a', data: '2026-10-25', testo: 'Sardo 13/16 S.P.', colore: '', stato: 'nuova' },
      { uid: 'b', data: '2026-10-25', testo: 'Compleanno nonna', colore: '', stato: 'nuova' },
      { uid: 'c', data: '2026-10-24', testo: 'Gallo 4 cena', colore: '', stato: 'nuova' },
      { uid: 'd', data: '2026-10-25', testo: 'Neri 6', colore: '', stato: 'scartata' },
    ],
  );
  assert.deepEqual(elenco.map((p) => [p.data, p.servizio, p.nome, p.persone, p.sala, p.daConfermare]), [
    ['2026-10-24', 'Cena', 'Gallo', 4, '', true],
    ['2026-10-25', 'Pranzo', 'Rossi', 8, 'Antica stalla', false],
    ['2026-10-25', 'Pranzo', 'Sardo', 16, 'Panoramica', true],
  ]);
  assert.deepEqual([elenco[2].min, elenco[2].max], [13, 16]);

  // dal database: le confermate dalla disposizione, le da confermare da Family Wall, nei giorni chiesti
  await db.initDatabase();
  await db.salvaDisposizioneGiorno(giorno(5), 'Pranzo', piani);
  await db.exec("INSERT INTO prenotazioni_esterne (uid, data, testo, stato) VALUES ('cal1', ?, 'Ferri 9+2+1', 'nuova')", [giorno(6)]);
  const dalDb = await db.prenotazioniPerCalendario(giorno(5), giorno(6));
  assert.ok(dalDb.some((p) => p.nome === 'Rossi' && p.data === giorno(5) && !p.daConfermare));
  assert.ok(dalDb.some((p) => p.nome === 'Ferri' && p.persone === 12 && p.daConfermare));
  assert.equal((await db.prenotazioniPerCalendario(giorno(7), giorno(8))).length, 0);
});
