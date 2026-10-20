import { test } from 'node:test';
import assert from 'node:assert/strict';
import { premi, aggiungi, statoValore, numeroDi, testoDi, settimanaPunti, MENO } from '../tastierino.js';

const scrivi = (tasti, inizio = '', nuovo = false) => tasti.reduce((t, k, i) => premi(t, k, nuovo && i === 0), inizio);

test('tastierino: cifre, virgola, un solo decimale, segno', () => {
  assert.equal(scrivi(['3', ',', '5']), '3,5');
  assert.equal(scrivi([',', '5']), '0,5');
  assert.equal(scrivi(['3', ',', '5', '7']), '3,5'); // un decimale basta
  assert.equal(scrivi(['3', ',', ',']), '3,');
  assert.equal(scrivi(['1', '8', 'segno']), `${MENO}18`);
  assert.equal(scrivi(['segno', '2', '0']), `${MENO}20`);
  assert.equal(scrivi(['segno', 'segno']), '');
  assert.equal(scrivi(['0', '4']), '4');
  assert.equal(scrivi(['1', '2', '3', '4']), '123'); // al massimo tre cifre intere
  assert.equal(numeroDi(`${MENO}18,5`), -18.5);
});

test('tastierino: il valore proposto si sostituisce con la prima cifra, il cancella lo svuota', () => {
  assert.equal(scrivi(['4'], '2,5', true), '4');
  assert.equal(scrivi(['cancella'], '2,5', true), '');
  assert.equal(scrivi(['segno'], '18', true), `${MENO}18`); // il segno si applica al valore proposto
  assert.equal(scrivi(['cancella', 'cancella'], `${MENO}2`), '');
});

test('tastierino: ±0,5 e stato rispetto ai limiti', () => {
  assert.equal(aggiungi('2,5', 0.5), '3');
  assert.equal(aggiungi('', -0.5), `${MENO}0,5`);
  assert.equal(aggiungi(`${MENO}18`, -0.5), `${MENO}18,5`);
  assert.equal(testoDi(null), '');
  const frigo = { temp_min: 0, temp_max: 4 };
  assert.equal(statoValore('', frigo), 'vuoto');
  assert.equal(statoValore('4', frigo), 'ok');
  assert.equal(statoValore('4,5', frigo), 'fuori');
  assert.equal(statoValore(`${MENO}0,5`, frigo), 'fuori');
  assert.equal(statoValore(`${MENO}20`, { temp_min: -25, temp_max: -18 }), 'ok');
});

test('settimana a pallini: ok, fuori, manca per ogni frigorifero', () => {
  const ora = (g) => new Date(`${g}T10:00:00`).toISOString();
  const righe = [
    { punto_controllo_id: 1, data_ora: ora('2026-10-20'), esito: 'conforme' },
    { punto_controllo_id: 1, data_ora: ora('2026-10-19'), esito: 'conforme' },
    { punto_controllo_id: 1, data_ora: ora('2026-10-19'), esito: 'non conforme' },
    { punto_controllo_id: 2, data_ora: ora('2026-10-10'), esito: 'conforme' }, // fuori dalla settimana
  ];
  const s = settimanaPunti([{ id: 1 }, { id: 2 }], righe, '2026-10-20');
  assert.equal(s[1].length, 7);
  assert.deepEqual(s[1].map((g) => g.stato), ['manca', 'manca', 'manca', 'manca', 'manca', 'fuori', 'ok']);
  assert.equal(s[1][0].giorno, '2026-10-14');
  assert.ok(s[2].every((g) => g.stato === 'manca'));
});
