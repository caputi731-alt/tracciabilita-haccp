import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizzaOra, prossimiPromemoria, avvisiScadenze, PROMEMORIA } from '../notifiche.js';

test('orario del promemoria: formati accettati', () => {
  assert.equal(normalizzaOra('9:05'), '09:05');
  assert.equal(normalizzaOra('10'), '10:00');
  assert.equal(normalizzaOra('22.30'), '22:30');
  assert.equal(normalizzaOra('25:00'), null);
  assert.equal(normalizzaOra('ciao'), null);
});

test('promemoria: uno al giorno, oggi saltato se già fatto o se l\'ora è passata', () => {
  const mattina = new Date(2026, 9, 8, 8, 0);
  const sera = new Date(2026, 9, 8, 18, 0);
  assert.equal(prossimiPromemoria('10:00', mattina, false, 14).length, 14);
  assert.equal(prossimiPromemoria('10:00', mattina, false, 14)[0].getDate(), 8);
  assert.equal(prossimiPromemoria('10:00', mattina, true, 14)[0].getDate(), 9, 'oggi già fatto: si parte da domani');
  assert.equal(prossimiPromemoria('10:00', sera, false, 14)[0].getDate(), 9, 'ora già passata: si parte da domani');
  assert.ok(prossimiPromemoria('10:00', mattina, false, 14).every((d) => d.getHours() === 10 && d.getMinutes() === 0));
});

test('scadenze: avviso solo nei giorni in cui qualcosa scade, con i nomi dei prodotti', () => {
  const mattina = new Date(2026, 9, 8, 6, 0); // 8 ottobre, prima delle 8
  const lotti = [
    { prodotto: 'Yogurt', data_scadenza: '2026-10-06' },              // già scaduto
    { prodotto: 'Burrata', data_scadenza: '2026-10-08' },             // scade oggi
    { prodotto: 'Burrata', data_scadenza: '2026-10-08T00:00:00.000Z' }, // stesso prodotto, altro lotto
    { prodotto: 'Agnello', data_scadenza: '2026-10-09' },             // scade domani
    { prodotto: 'Semola', data_scadenza: '2026-10-15' },
    { prodotto: 'Senza scadenza', data_scadenza: null },
  ];
  const a = avvisiScadenze(lotti, '08:00', mattina, 14);
  assert.deepEqual(a.map((x) => [x.data.getDate(), x.data.getHours(), x.testo]), [
    [8, 8, 'Già scaduti: Yogurt. Scade oggi: Burrata. Scade domani: Agnello.'],
    [9, 8, 'Scade oggi: Agnello.'],
    [14, 8, 'Scade domani: Semola.'],
    [15, 8, 'Scade oggi: Semola.'],
  ]);
  // ora già passata: l'avviso di oggi non si programma
  assert.equal(avvisiScadenze(lotti, '08:00', new Date(2026, 9, 8, 9, 0), 14)[0].data.getDate(), 9);
  assert.deepEqual(avvisiScadenze([], '08:00', mattina), []);
  const tanti = ['A', 'B', 'C', 'D', 'E', 'F'].map((p) => ({ prodotto: p, data_scadenza: '2026-10-08' }));
  assert.equal(avvisiScadenze(tanti, '08:00', mattina, 1)[0].testo, 'Scade oggi: A, B, C, D e altri 2.');
  assert.deepEqual(Object.keys(PROMEMORIA), ['temperature', 'pulizie', 'scadenze']);
  assert.equal(new Set(Object.values(PROMEMORIA).map((p) => p.canale)).size, 3);
});
