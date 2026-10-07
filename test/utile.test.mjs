import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aNumero, piuGiorni, limitiGiorni, giornoDi, isoLocale, escHtml, numeroPerCampo } from '../utile.js';

test('numeri digitati: virgola, punto, negativi, testi non validi', () => {
  assert.equal(aNumero('0,5'), 0.5);
  assert.equal(aNumero('0.5'), 0.5);
  assert.equal(aNumero('-18'), -18);
  assert.equal(aNumero(' 3,50 '), 3.5);
  assert.equal(aNumero(''), null);
  assert.equal(aNumero('-'), null);
  assert.equal(aNumero('abc'), null);
  assert.equal(aNumero('1,2,3'), null);
  assert.equal(aNumero(4), 4);
  assert.equal(numeroPerCampo(3.5), '3,5');
});

test('giorni: sempre quelli del telefono, anche dopo mezzanotte e col cambio dell\'ora', () => {
  // TZ=Europe/Rome impostato dallo script di test
  assert.equal(piuGiorni('2026-10-08', 3), '2026-10-11');
  assert.equal(piuGiorni('2026-10-24', 1), '2026-10-25'); // notte del cambio dell'ora
  assert.equal(piuGiorni('2026-03-01', -1), '2026-02-28');
  const mezzanotteEMezza = new Date(2026, 9, 9, 0, 30);
  assert.equal(isoLocale(mezzanotteEMezza), '2026-10-09');
  assert.equal(giornoDi(mezzanotteEMezza.toISOString()), '2026-10-09');
  assert.equal(giornoDi('2026-10-09'), '2026-10-09');
  const [da, a] = limitiGiorni('2026-10-09');
  assert.ok(mezzanotteEMezza.toISOString() >= da && mezzanotteEMezza.toISOString() < a);
  assert.ok(new Date(2026, 9, 8, 23, 59).toISOString() < da);
});

test('testi dentro l\'HTML delle stampe', () => {
  assert.equal(escHtml('Olio & aceto <500g> "bio"'), 'Olio &amp; aceto &lt;500g&gt; &quot;bio&quot;');
  assert.equal(escHtml(null), '');
});
