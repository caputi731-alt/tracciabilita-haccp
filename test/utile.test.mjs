import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aNumero, piuGiorni, limitiGiorni, giornoDi, isoLocale, escHtml, numeroPerCampo, backupDaEliminare } from '../utile.js';

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

test('backup a rotazione: un file per ognuno degli ultimi 3 giorni con un backup', () => {
  const n = (g, o) => `backup-haccp-202610${g}-${o}.json`;
  // un backup al giorno: restano gli ultimi tre
  assert.deepEqual(backupDaEliminare([n('05', '0900'), n('06', '0900'), n('07', '0900'), n('08', '0900')]), [n('05', '0900')]);
  // più backup nello stesso giorno: resta il più recente di ogni giorno
  assert.deepEqual(
    backupDaEliminare([n('08', '0900'), n('08', '1300'), n('08', '1100'), n('07', '0900'), n('06', '2000'), n('06', '0800')]).sort(),
    [n('06', '0800'), n('08', '0900'), n('08', '1100')].sort());
  // app chiusa per giorni: contano i giorni con un backup, le copie non spariscono
  assert.deepEqual(backupDaEliminare([n('01', '0900'), n('02', '0900'), n('08', '0900')]), []);
  // fino a tre giorni non si elimina niente; nomi senza estensione (come li crea Android) o di altri file
  assert.deepEqual(backupDaEliminare([n('07', '0900'), n('08', '0900')]), []);
  assert.deepEqual(backupDaEliminare(['backup-haccp-20261008-0900', 'backup-haccp-20261008-0900 (1).json', 'foto', 'altro.json', 'backup-haccp-vecchio.json']).length, 1);
  assert.deepEqual(backupDaEliminare([]), []);
  // con 14 file in chiaro lasciati dalla versione precedente: ne restano 3
  const tanti = Array.from({ length: 14 }, (_, i) => n(String(i + 10), '0900'));
  assert.deepEqual(backupDaEliminare(tanti).length, 11);
  assert.ok(!backupDaEliminare(tanti).includes(n('23', '0900')) && !backupDaEliminare(tanti).includes(n('21', '0900')));
});
