// Disdette (scelta di Luca del 23/10/2026): la prenotazione disdetta libera il posto, resta visibile come "disdetta", non conta
// nel calendario né nella stima; "Annulla" entro 10 minuti la rimette com'era. Più: una prenotazione di Family Wall confermata
// la cui tavolata viene tolta non resta "confermata" senza tavolata. Nomi e telefoni inventati.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../database.js';
import { aggiornaDaFamilyWall } from '../familywallAggiorna.js';
import { SALE, nuovaTavolata, trova, metti, pianoVuoto } from '../sale.js';
import { confronta } from '../familywall.js';
import { oggiLocale, piuGiorni } from '../utile.js';

const oggi = oggiLocale();
const giorno = (n) => piuGiorni(oggi, n);
const ics = (eventi) => [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//prova//IT',
  ...eventi.flatMap((e) => ['BEGIN:VEVENT', ...e, 'END:VEVENT']),
  'END:VCALENDAR', '',
].join('\r\n');
const calendario = (eventi) => async () => ({ ok: true, status: 200, text: async () => ics(eventi) });
const dtstart = (n) => `DTSTART;VALUE=DATE:${giorno(n).replace(/-/g, '')}`;
const vuoti = () => ({ stalla: pianoVuoto(SALE.stalla), panoramica: pianoVuoto(SALE.panoramica) });
const stato = async (uid) => (await db.queryOne('SELECT * FROM prenotazioni_esterne WHERE uid = ?', [uid]));
const coperti = async (n) => (await db.prenotazioniPerCalendario(giorno(n), giorno(n))).reduce((s, p) => s + (Number(p.persone) || 0), 0);

test('disdetta di una tavolata scritta a mano: libera il posto, resta fra le disdette, Annulla la rimette', async () => {
  await db.initDatabase();
  const piani = vuoti();
  const rossi = nuovaTavolata({ nome: 'Rossi', persone: '8', note: 'Tel 3330000001' });
  const bianchi = nuovaTavolata({ nome: 'Bianchi', persone: '4' });
  piani.stalla = metti(SALE.stalla, metti(SALE.stalla, piani.stalla, 0, rossi), 0, bianchi);
  await db.salvaDisposizioneGiorno(giorno(5), 'Pranzo', piani);
  assert.equal(await coperti(5), 12);
  const posto = trova(SALE.stalla, (await db.disposizioneGiorno(giorno(5), 'Pranzo')).stalla, rossi.id).t.p;

  const esito = await db.disdiciTavolata(giorno(5), 'Pranzo', rossi.id);
  assert.equal(esito.nome, 'Rossi');
  assert.ok(!trova(SALE.stalla, (await db.disposizioneGiorno(giorno(5), 'Pranzo')).stalla, rossi.id));
  assert.equal(await coperti(5), 4, 'la disdetta non conta nel calendario né nella stima');
  const disdette = await db.disdetteDelGiorno(giorno(5), 'Pranzo');
  assert.equal(disdette.length, 1);
  assert.equal(disdette[0].tavolata.nome, 'Rossi');
  assert.equal(disdette[0].sala, 'stalla');
  // un'altra giornata non le vede
  assert.equal((await db.disdetteDelGiorno(giorno(5), 'Cena')).length, 0);
  await assert.rejects(db.disdiciTavolata(giorno(5), 'Pranzo', rossi.id), /non trovata/);

  // Annulla: torna nella sua fila, allo stesso posto
  const tornata = await db.annullaDisdetta(esito.id);
  assert.equal(tornata.sala, 'stalla');
  const q = trova(SALE.stalla, (await db.disposizioneGiorno(giorno(5), 'Pranzo')).stalla, rossi.id);
  assert.equal(q.t.p, posto);
  assert.equal(q.t.note, 'Tel 3330000001');
  assert.equal((await db.disdetteDelGiorno(giorno(5), 'Pranzo')).length, 0);
  assert.equal(await coperti(5), 12);

  // dopo 10 minuti non si annulla più
  const di = await db.disdiciTavolata(giorno(5), 'Pranzo', rossi.id);
  await db.exec('UPDATE disdette SET creato_il = ? WHERE id = ?', [new Date(Date.now() - 11 * 60000).toISOString(), di.id]);
  await assert.rejects(db.annullaDisdetta(di.id), /10 minuti/);
  assert.equal((await db.disdetteDelGiorno(giorno(5), 'Pranzo')).length, 1);
});

test('Annulla: se il posto è stato preso, la tavolata va nel posto libero migliore', async () => {
  await db.initDatabase();
  const piani = vuoti();
  const verdi = nuovaTavolata({ nome: 'Verdi', persone: '6' });
  piani.stalla = metti(SALE.stalla, piani.stalla, 0, verdi);
  await db.salvaDisposizioneGiorno(giorno(6), 'Pranzo', piani);
  const { id } = await db.disdiciTavolata(giorno(6), 'Pranzo', verdi.id);
  // nel frattempo qualcuno occupa lo stesso posto
  const dopo = await db.disposizioneGiorno(giorno(6), 'Pranzo');
  const neri = nuovaTavolata({ nome: 'Neri', persone: '6' });
  dopo.stalla = metti(SALE.stalla, dopo.stalla, 0, neri);
  await db.salvaDisposizioneGiorno(giorno(6), 'Pranzo', dopo);
  await db.annullaDisdetta(id);
  const finale = await db.disposizioneGiorno(giorno(6), 'Pranzo');
  const a = trova(SALE.stalla, finale.stalla, verdi.id) || trova(SALE.panoramica, finale.panoramica, verdi.id);
  const b = trova(SALE.stalla, finale.stalla, neri.id);
  assert.ok(a && b, 'tutte e due a tavola');
  if (trova(SALE.stalla, finale.stalla, verdi.id) && a.f === b.f) assert.notEqual(a.t.p, b.t.p);
});

test('Family Wall: disdetta di una da confermare e di una confermata; la tavolata tolta non lascia la riga "confermata"', async () => {
  await db.initDatabase();
  await db.salvaLinkFamilyWall('https://api.familywall.com/ical/prova');
  const eventi = [
    ['UID:d1', dtstart(2), 'SUMMARY:Gialli 7 A.S. 3470009991'],
    ['UID:d2', dtstart(2), 'SUMMARY:Blu 5 S.P.'],
    ['UID:d3', dtstart(3), 'SUMMARY:Viola 9 A.S.'],
  ];
  await aggiornaDaFamilyWall({ fetchFn: calendario(eventi) });
  assert.equal(await coperti(2), 12);

  // da confermare → disdetta: esce da calendario e stima, resta fra le disdette, non torna con un aggiornamento uguale
  const d1 = await db.disdiciPrenotazioneEsterna('d1');
  assert.equal(d1.nome, 'Gialli');
  assert.equal((await stato('d1')).stato, 'disdetta');
  assert.equal(await coperti(2), 5);
  const lista = await db.disdetteDelGiorno(giorno(2), 'Pranzo');
  assert.equal(lista.length, 1);
  assert.equal(lista[0].tavolata.persone, '7');
  assert.equal(lista[0].sala, 'stalla');
  await aggiornaDaFamilyWall({ fetchFn: calendario(eventi) });
  assert.equal((await stato('d1')).stato, 'disdetta');
  await assert.rejects(db.disdiciPrenotazioneEsterna('d1'), /non è più da confermare/);
  // Annulla: torna da confermare
  assert.deepEqual(await db.annullaDisdetta(d1.id), { sala: null });
  assert.equal((await stato('d1')).stato, 'nuova');
  assert.equal(await coperti(2), 12);

  // confermata → disdetta dalla Sala: anche la riga di Family Wall è disdetta; Annulla la rimette a tavola e confermata
  const t2 = nuovaTavolata({ nome: 'Blu', persone: '5' });
  await db.confermaPrenotazioneEsterna('d2', { data: giorno(2), servizio: 'Pranzo', sala: 'panoramica', tavolata: t2 });
  const dis = await db.disdiciTavolata(giorno(2), 'Pranzo', t2.id);
  assert.equal((await stato('d2')).stato, 'disdetta');
  assert.equal((await db.disdetteDelGiorno(giorno(2), 'Pranzo')).length, 1);
  await db.annullaDisdetta(dis.id);
  const r2 = await stato('d2');
  assert.equal(r2.stato, 'confermata');
  assert.equal(r2.tavolata_id, t2.id);
  assert.ok(trova(SALE.panoramica, (await db.disposizioneGiorno(giorno(2), 'Pranzo')).panoramica, t2.id));

  // disdetta e poi cambiata in Family Wall (giorno futuro): torna da confermare e sparisce dalle disdette
  await db.disdiciTavolata(giorno(2), 'Pranzo', t2.id);
  await aggiornaDaFamilyWall({ fetchFn: calendario([eventi[0], ['UID:d2', dtstart(2), 'SUMMARY:Blu 6 S.P.'], eventi[2]]) });
  const r2b = await stato('d2');
  assert.equal(r2b.stato, 'nuova');
  assert.equal(r2b.tavolata_id, null);
  assert.equal((await db.disdetteDelGiorno(giorno(2), 'Pranzo')).length, 0);

  // confermata e poi tolta con "Togli la tavolata" / sala svuotata: torna da confermare, non resta orfana
  const t3 = nuovaTavolata({ nome: 'Viola', persone: '9' });
  await db.confermaPrenotazioneEsterna('d3', { data: giorno(3), servizio: 'Pranzo', sala: 'stalla', tavolata: t3 });
  assert.equal((await stato('d3')).stato, 'confermata');
  await db.salvaDisposizioneGiorno(giorno(3), 'Pranzo', vuoti());
  const r3 = await stato('d3');
  assert.equal(r3.stato, 'nuova');
  assert.equal(r3.tavolata_id, null);
  assert.equal(await coperti(3), 9, 'torna fra quelle da confermare');
});

test('confronto: una disdetta del passato resta disdetta, una futura sparita si toglie', () => {
  const ieri = piuGiorni(oggi, -1), domani = piuGiorni(oggi, 1);
  const righe = [
    { uid: 'p', data: ieri, testo: 'Rossi 4', colore: '', stato: 'disdetta' },
    { uid: 'f', data: domani, testo: 'Neri 4', colore: '', stato: 'disdetta' },
  ];
  const c = confronta(righe, [{ uid: 'p', data: ieri, titolo: 'Rossi 5', descrizione: '', colore: '' }], oggi);
  assert.deepEqual(c.aggiorna, [{ uid: 'p', data: ieri, testo: 'Rossi 5', colore: '', stato: 'disdetta' }]);
  assert.deepEqual(c.elimina, ['f']);
});

test('backup: le disdette ci sono', async () => {
  await db.initDatabase();
  const dump = await db.esportaTutto();
  assert.ok(Array.isArray(dump.tabelle.disdette));
});

test('calendario del Menù: le prenotazioni portano id e uid, e "Disdici" con quelli funziona', async () => {
  await db.initDatabase();
  await db.salvaLinkFamilyWall('https://api.familywall.com/ical/prova');
  await aggiornaDaFamilyWall({ fetchFn: calendario([['UID:c1', dtstart(8), 'SUMMARY:Ferri 6 A.S.']]) });
  const piani = vuoti();
  const neri = nuovaTavolata({ nome: 'Neri', persone: '4' });
  piani.stalla = metti(SALE.stalla, piani.stalla, 0, neri);
  await db.salvaDisposizioneGiorno(giorno(8), 'Pranzo', piani);
  const el = await db.prenotazioniPerCalendario(giorno(8), giorno(8));
  const aTavola = el.find((p) => p.nome === 'Neri'), daConf = el.find((p) => p.nome === 'Ferri');
  assert.equal(aTavola.id, neri.id);
  assert.equal(daConf.uid, 'c1');
  await db.disdiciTavolata(aTavola.data, aTavola.servizio, aTavola.id);
  await db.disdiciPrenotazioneEsterna(daConf.uid);
  assert.equal((await db.prenotazioniPerCalendario(giorno(8), giorno(8))).length, 0);
  assert.equal((await db.disdetteDelGiorno(giorno(8), 'Pranzo')).length, 2);
});
