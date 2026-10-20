import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dosiRapide, scadenzaBreve } from '../magazzino.js';

const testi = (l) => l.map((d) => d.testo);

test('dosi rapide: a peso 0,5 e 1, a pezzi 1 e 2, più tutto', () => {
  assert.deepEqual(testi(dosiRapide('kg', 6, 6)), ['0,5 kg', '1 kg', 'Tutto']);
  assert.deepEqual(dosiRapide('kg', 6, 6)[2].qta, 6);
  assert.deepEqual(testi(dosiRapide('l', 10, 4)), ['0,5 l', '1 l', 'Tutto']);
  assert.deepEqual(testi(dosiRapide('pz', 12, 12)), ['1 pz', '2 pz', 'Tutto']);
  assert.deepEqual(testi(dosiRapide('conf', 3, 3)), ['1 conf', '2 conf', 'Tutto']);
  assert.deepEqual(testi(dosiRapide('g', 800, 800)), ['100 g', '500 g', 'Tutto']);
});

test('dosi rapide: niente dosi più grandi di quanto c\'è, niente doppioni', () => {
  assert.deepEqual(testi(dosiRapide('kg', 0.8, 0.8)), ['0,5 kg', 'Tutto']);
  assert.deepEqual(testi(dosiRapide('kg', 1, 1)), ['0,5 kg', '1 kg']); // "tutto" = 1 kg, già c'è
  assert.deepEqual(testi(dosiRapide('pz', 1, 1)), ['1 pz']);
  assert.deepEqual(dosiRapide('kg', 0, 0), []);
  assert.deepEqual(testi(dosiRapide('', 5, 5)), ['1', '2', 'Tutto']);
});

test('scadenza breve per la riga', () => {
  const oggi = '2026-10-20';
  assert.deepEqual(scadenzaBreve('2026-10-19', oggi), { testo: 'scaduto', tono: 'grave' });
  assert.equal(scadenzaBreve('2026-10-20', oggi).testo, 'oggi');
  assert.equal(scadenzaBreve('2026-10-21', oggi).testo, 'domani');
  assert.deepEqual(scadenzaBreve('2026-10-23', oggi), { testo: '23/10', tono: 'fare' });
  assert.deepEqual(scadenzaBreve('2026-10-26', oggi), { testo: '26/10', tono: 'info' });
  assert.equal(scadenzaBreve('2026-11-30', oggi), null);
  assert.equal(scadenzaBreve(null, oggi), null);
});
