import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SEZIONI_SUITE, GRUPPI_SEZIONI, cercaSezioni, semplifica, leggiPreferiti, cambiaPreferito, vociPreferite, vociDelGruppo,
} from '../sezioni.js';

const ids = (l) => l.map((v) => v.id);

test('sezioni: id unici, ogni voce porta a una rotta esistente o a una sezione della barra', () => {
  assert.equal(new Set(ids(SEZIONI_SUITE)).size, SEZIONI_SUITE.length);
  const app = readFileSync(new URL('../App.js', import.meta.url), 'utf8');
  for (const v of SEZIONI_SUITE) {
    if (v.sezione) {
      assert.ok(['oggi', 'sale', 'gestione'].includes(v.sezione), v.id);
      if (v.sezione === 'gestione') assert.ok(['Menù', 'Incassi'].includes(v.parte), v.id);
    } else {
      assert.ok(app.includes(`name="${v.rotta}"`), `rotta ${v.rotta} mancante in App.js`);
    }
    assert.ok(v.titolo && v.desc && v.icona, v.id);
  }
});

test('sezioni: i gruppi di Altro contengono le stesse funzioni di prima', () => {
  assert.deepEqual(GRUPPI_SEZIONI, ['Registri HACCP', 'Cucina', 'Archivio e documenti']);
  assert.deepEqual(ids(vociDelGruppo('Cucina')), ['magazzino', 'carico', 'eventi', 'produzioni', 'etichette']);
  assert.deepEqual(ids(vociDelGruppo('Archivio e documenti')), ['anagrafiche', 'documenti']);
  assert.ok(ids(vociDelGruppo('Registri HACCP')).includes('giro'));
});

test('sezioni: le schede interne aprono la linguetta giusta', () => {
  const r = SEZIONI_SUITE.find((v) => v.id === 'ricette');
  assert.deepEqual([r.rotta, r.parametri], ['Anagrafiche', { scheda: 'Ricette' }]);
  const b = SEZIONI_SUITE.find((v) => v.id === 'backup');
  assert.deepEqual([b.rotta, b.parametri], ['Documenti', { scheda: 'Backup e dati' }]);
});

test('ricerca: senza accenti e maiuscole, anche per sinonimi', () => {
  assert.equal(semplifica('  Non   Conformità! '), 'non conformita');
  assert.equal(cercaSezioni('non conformita')[0].id, 'nonconformita');
  assert.equal(cercaSezioni('RICETTE')[0].id, 'ricette');
  assert.ok(ids(cercaSezioni('frigo')).includes('temperature'));
  assert.ok(ids(cercaSezioni('frigo')).includes('frigoriferi'));
  assert.ok(ids(cercaSezioni('pulizie')).includes('sanificazione'));
  assert.equal(cercaSezioni('prenotazioni')[0].id, 'sala');
  assert.equal(cercaSezioni('incassi')[0].id, 'incassi');
  assert.ok(ids(cercaSezioni('asl')).includes('registri'));
});

test('ricerca: prima chi ha la parola nel titolo; tutte le parole devono esserci', () => {
  assert.equal(cercaSezioni('fri')[0].id, 'frigoriferi'); // titolo prima delle parole chiave
  assert.deepEqual(ids(cercaSezioni('backup pin')), ['backup']);
  assert.deepEqual(cercaSezioni('zzz'), []);
  assert.deepEqual(cercaSezioni('   '), []);
  assert.deepEqual(cercaSezioni(''), []);
});

test('preferiti: si leggono senza rompersi, si aggiungono in fondo e si tolgono', () => {
  assert.deepEqual(leggiPreferiti(null), []);
  assert.deepEqual(leggiPreferiti('non è json'), []);
  assert.deepEqual(leggiPreferiti('{"a":1}'), []);
  assert.deepEqual(leggiPreferiti('["ricette","sparita","ricette",3,"sala"]'), ['ricette', 'sala']);
  let l = cambiaPreferito([], 'temperature');
  l = cambiaPreferito(l, 'menu');
  assert.deepEqual(l, ['temperature', 'menu']);
  assert.deepEqual(cambiaPreferito(l, 'temperature'), ['menu']);
  assert.deepEqual(cambiaPreferito(l, 'inesistente'), l);
  assert.deepEqual(ids(vociPreferite(['menu', 'temperature'])), ['menu', 'temperature']);
});
