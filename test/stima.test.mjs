// Stima dei guadagni del mese (stima.js) e prezzi salvati (database.js). Nomi inventati.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PREZZI_BASE, MERCE_BASE, prezziPuliti, mercePulita, composizione, stimaMese, merceCalcolata, copertiScritti } from '../stima.js';
import { prenotazioniCalendario } from '../familywall.js';
import { initDatabase, prezziStima, salvaPrezziStima, togliPrezziGiorno, esportaTutto } from '../database.js';

test('composizione: bambini e neonati dalle note, gli altri adulti', () => {
  assert.deepEqual(composizione({ persone: 12, note: '9 adulti, 2 bambini (8 anni), 1 neonato · Tel 333 0000000' }),
    { adulti: 9, bambini: 2, neonati: 1, persone: 12 });
  assert.deepEqual(composizione({ persone: 8, note: 'compleanno' }), { adulti: 8, bambini: 0, neonati: 0, persone: 8 });
  assert.deepEqual(composizione({ persone: '6', bambini: 1 }), { adulti: 5, bambini: 1, neonati: 0, persone: 6 });
  // persone cambiate a mano dopo: il totale resta quello della tavolata
  assert.deepEqual(composizione({ persone: 3, note: '2 adulti, 4 bambini' }), { adulti: 0, bambini: 3, neonati: 0, persone: 3 });
  assert.equal(copertiScritti({ adulti: 9, bambini: 2, neonati: 1 }), '9 adulti, 2 bambini, 1 neonato');
  assert.equal(copertiScritti({ adulti: 1, bambini: 0, neonati: 0 }), '1 adulto');
});

test('prezzi e merce: valori non validi tornano a quelli di partenza', () => {
  assert.deepEqual(prezziPuliti(null), PREZZI_BASE);
  assert.deepEqual(prezziPuliti({ adulto: '45', bambino: -3, neonato: '' }), { adulto: 45, bambino: 25, neonato: 0 });
  assert.deepEqual(prezziPuliti({ adulto: 60 }, { adulto: 1, bambino: 2, neonato: 3 }), { adulto: 60, bambino: 2, neonato: 3 });
  assert.equal(mercePulita('28.5'), 28.5);
  assert.equal(mercePulita(150), MERCE_BASE);
  assert.equal(mercePulita(null), MERCE_BASE);
});

test('stima del mese: incasso vero dove c\'è, stima negli altri giorni, da confermare a parte', () => {
  const giorni = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'];
  const prenotazioni = [
    { data: '2026-11-01', servizio: 'Pranzo', nome: 'Bianchi', persone: 10, note: '8 adulti, 2 bambini', daConfermare: false },
    { data: '2026-11-02', servizio: 'Pranzo', nome: 'Verdi', persone: 20, note: '', daConfermare: false },
    { data: '2026-11-02', servizio: 'Cena', nome: 'Gialli', persone: 4, bambini: 1, neonati: 1, daConfermare: true },
    { data: '2026-11-03', servizio: 'Pranzo', nome: 'Viola', persone: 0, daConfermare: false }, // senza persone: non conta
  ];
  const incassi = [{ giorno: '2026-11-01', contanti: 300, pos: 200, altro: 0 }, { giorno: '2026-11-04', contanti: 0, pos: 110, altro: 0 }];
  const s = stimaMese({ giorni, prenotazioni, incassi, prezzi: { giorni: { '2026-11-02': { adulto: 40, bambino: 20, neonato: 0 } } }, merce: 30 });

  assert.deepEqual(s.giorni.map((g) => [g.giorno, g.stima, g.reale, g.conta]), [
    ['2026-11-01', 450, 500, 500],          // 8×50 + 2×25 stimati, ma c'è l'incasso vero
    ['2026-11-02', 900, null, 900],         // prezzi del giorno: 20×40 + (2×40 + 1×20 + 0)
    ['2026-11-04', 0, 110, 110],            // incasso senza prenotazioni
  ]);
  assert.equal(s.giorni[1].prezziDelGiorno, true);
  assert.deepEqual(s.coperti, { adulti: 30, bambini: 3, neonati: 1, persone: 34 });
  assert.deepEqual(s.daConfermare, { adulti: 2, bambini: 1, neonati: 1, persone: 4 });
  assert.equal(s.lordo, 1510);
  assert.equal(s.reale, 610);
  assert.equal(s.stimato, 900);
  assert.equal(s.lordoDaConfermare, 100);
  assert.equal(s.giorniReali, 2);
  assert.equal(s.giorniStimati, 1);
  assert.equal(s.netto, 1372.73);           // 1510 / 1,10
  assert.equal(s.costoMerce, 411.82);       // 30%
  assert.equal(s.margine, 960.91);
});

test('stima: i prezzi di sempre cambiati valgono per tutti i giorni senza prezzi propri', () => {
  const s = stimaMese({
    giorni: ['2026-11-05'], prenotazioni: [{ data: '2026-11-05', persone: 3, note: '1 bambino' }],
    prezzi: { base: { adulto: 60, bambino: 30, neonato: 5 } }, merce: 'x',
  });
  assert.equal(s.lordo, 150);
  assert.equal(s.merce, MERCE_BASE);
  assert.deepEqual(stimaMese({ giorni: ['2026-11-06'] }).giorni, []);
});

test('merce calcolata sui mesi prima: solo i mesi con incassi', () => {
  assert.equal(merceCalcolata([]), null);
  assert.equal(merceCalcolata([{ merce: 500, incassato: 0 }]), null);
  assert.deepEqual(merceCalcolata([{ merce: 3000, incassato: 11000 }, { merce: 3000, incassato: 11000 }, { merce: 900, incassato: 0 }]),
    { percentuale: 30, mesi: 2 });
});

test('prenotazioni del calendario: note della tavolata e bambini di Family Wall arrivano alla stima', async () => {
  const { SALE, nuovaTavolata, pianoVuoto } = await import('../sale.js');
  const piani = { stalla: pianoVuoto(SALE.stalla), panoramica: pianoVuoto(SALE.panoramica) };
  piani.stalla.file[0].push(nuovaTavolata({ nome: 'Rossi', persone: '12', note: '9 adulti, 2 bambini, 1 neonato' }));
  const elenco = prenotazioniCalendario([{ data: '2026-11-07', servizio: 'Pranzo', piani }],
    [{ uid: 'x', data: '2026-11-07', testo: 'Neri 5-1(8anni)', colore: '', stato: 'nuova' }]);
  const s = stimaMese({ giorni: ['2026-11-07'], prenotazioni: elenco });
  assert.deepEqual(s.coperti, { adulti: 14, bambini: 3, neonati: 1, persone: 18 });
  assert.equal(s.lordo, 14 * 50 + 3 * 25);
});

test('database: prezzi di sempre, prezzi di un giorno, nel backup', async () => {
  await initDatabase();
  assert.deepEqual(await prezziStima(), { base: null, merce: null, giorni: {} });
  await salvaPrezziStima({ giorno: 'base', adulto: '55', bambino: 25, neonato: 0, merce: 28 });
  await salvaPrezziStima({ giorno: '2026-12-25', adulto: 80, bambino: 40, neonato: 0 });
  let p = await prezziStima();
  assert.deepEqual(p.base, { adulto: 55, bambino: 25, neonato: 0 });
  assert.equal(p.merce, 28);
  assert.deepEqual(p.giorni['2026-12-25'], { adulto: 80, bambino: 40, neonato: 0 });
  await assert.rejects(salvaPrezziStima({ giorno: 'base', adulto: 50, bambino: 25, neonato: 0, merce: 120 }));
  await assert.rejects(salvaPrezziStima({ giorno: '2026-12-26', adulto: -1, bambino: 25, neonato: 0 }));
  await assert.rejects(salvaPrezziStima({ giorno: 'domani', adulto: 1, bambino: 1, neonato: 0 }));
  assert.ok((await esportaTutto()).tabelle.stima_prezzi.length === 2);
  await togliPrezziGiorno('2026-12-25');
  await togliPrezziGiorno('base'); // quella di sempre non si toglie così
  p = await prezziStima();
  assert.deepEqual(p.giorni, {});
  assert.equal(p.merce, 28);
});
