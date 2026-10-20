import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rigaPulizia, riepilogoPulizie } from '../pulizie.js';

const oggi = '2026-10-20'; // martedì

test('pulizia fatta oggi: ora, e si può annullare solo nei primi 10 minuti', () => {
  const adesso = new Date('2026-10-20T15:45:00').getTime();
  const fatta = { data_ora: new Date('2026-10-20T15:40:00').toISOString(), creato_il: new Date('2026-10-20T15:40:00').toISOString() };
  const r = rigaPulizia({ frequenza: 'giornaliera', daFare: false, giorniFa: 0, intervallo: 1 }, fatta, oggi, adesso);
  assert.equal(r.stato, 'fatta');
  assert.equal(r.testo, 'Ogni giorno · fatta alle 15:40');
  assert.equal(r.annullabile, true);
  assert.equal(rigaPulizia({ frequenza: 'giornaliera' }, fatta, oggi, adesso + 11 * 60000).annullabile, false);
});

test('pulizia da fare: frequenza, ultima volta e prodotto previsto', () => {
  assert.equal(rigaPulizia({ frequenza: 'giornaliera', daFare: true, giorniFa: 1, intervallo: 1 }, null, oggi).testo, 'Ogni giorno · da fare');
  const s = rigaPulizia({ frequenza: 'settimanale', daFare: true, giorniFa: 9, intervallo: 7, prodotto_previsto: 'sgrassatore' }, null, oggi);
  assert.equal(s.stato, 'fare');
  assert.equal(s.testo, 'Ogni settimana · da fare (ultima 9 giorni fa) · sgrassatore');
  assert.equal(rigaPulizia({ frequenza: 'mensile', daFare: true, giorniFa: null, intervallo: 30 }, null, oggi).testo, 'Ogni mese · da fare (mai fatta)');
});

test('pulizia a posto: quando tocca la prossima', () => {
  assert.equal(rigaPulizia({ frequenza: 'settimanale', daFare: false, giorniFa: 4, intervallo: 7 }, null, oggi).testo, 'Ogni settimana · prossima venerdì');
  assert.equal(rigaPulizia({ frequenza: 'settimanale', daFare: false, giorniFa: 6, intervallo: 7 }, null, oggi).testo, 'Ogni settimana · prossima domani');
  assert.equal(rigaPulizia({ frequenza: 'mensile', daFare: false, giorniFa: 10, intervallo: 30 }, null, oggi).testo, 'Ogni mese · prossima fra 20 giorni');
});

test('riepilogo in cima', () => {
  assert.equal(riepilogoPulizie([{ stato: 'fare' }, { stato: 'fare' }, { stato: 'fatta' }, { stato: 'aposto' }]), '2 da fare · 1 fatta oggi');
  assert.equal(riepilogoPulizie([{ stato: 'fatta' }, { stato: 'aposto' }]), 'Tutto pulito per oggi');
  assert.equal(riepilogoPulizie([{ stato: 'aposto' }]), 'Nessuna pulizia da fare oggi');
  assert.equal(riepilogoPulizie([]), '');
});
