import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../database.js';
import {
  pinValido, derivaChiave, proteggi, apri, eProtetto, uguali, casuali, provaMotore, GIRI,
} from '../protezione.js';
import {
  impostaPin, verificaPin, pinImpostato, testoBackup, leggiBackup,
} from '../pin.js';

before(async () => { await db.initDatabase(); });

test('PIN: solo 6 cifre', () => {
  assert.ok(pinValido('012345'));
  for (const no of ['', '12345', '1234567', '12345a', ' 12345', null, undefined]) assert.ok(!pinValido(no));
});

test('la chiave dipende da PIN, sale e giri; stesso ingresso, stessa chiave', async () => {
  await provaMotore();
  const sale = await casuali(16);
  const k = await derivaChiave('123456', sale, 10000);
  assert.match(k, /^[0-9a-f]{64}$/);
  assert.equal(k, await derivaChiave('123456', sale, 10000));
  assert.notEqual(k, await derivaChiave('123457', sale, 10000));
  assert.notEqual(k, await derivaChiave('123456', await casuali(16), 10000));
  assert.notEqual(k, await derivaChiave('123456', sale, 10001));
  await assert.rejects(derivaChiave('1234', sale), /6 cifre/);
  await assert.rejects(derivaChiave('123456', sale, 10), /non valido/);
  await assert.rejects(derivaChiave('123456', 'sale corto'), /non valido/);
  assert.ok(uguali('abc', 'abc') && !uguali('abc', 'abd') && !uguali('abc', 'abcd') && !uguali('', undefined));
});

test('file protetto: si apre solo con la chiave giusta e non si lascia modificare', async () => {
  const sale = await casuali(16);
  const segreto = { sale, giri: 10000, chiave: await derivaChiave('246810', sale, 10000) };
  const dati = { nota: 'Caffè, pesce spada à la carte — €12,50 😀   "virgolette" \\ fine', lungo: 'x'.repeat(200000) };
  const file = await proteggi(JSON.stringify(dati), segreto, '2026-10-08T10:00:00.000Z');
  const busta = JSON.parse(file);
  assert.ok(eProtetto(busta));
  assert.ok(!file.includes('pesce spada'), 'il contenuto non deve leggersi nel file');
  assert.equal(busta.generato, '2026-10-08T10:00:00.000Z');
  // accenti, simboli e faccine tornano identici
  assert.deepEqual(JSON.parse(await apri(busta, segreto.chiave)), dati);
  // chiave sbagliata
  await assert.rejects(apri(busta, await derivaChiave('246811', sale, 10000)), (e) => e.pinErrato === true);
  // file ritoccato: nel contenuto, nell'intestazione o nella firma
  const ritoccato = busta.dati.slice(0, 20) + (busta.dati[20] === 'A' ? 'B' : 'A') + busta.dati.slice(21);
  await assert.rejects(apri({ ...busta, dati: ritoccato }, segreto.chiave), (e) => e.pinErrato === true);
  await assert.rejects(apri({ ...busta, generato: '2020-01-01T00:00:00.000Z' }, segreto.chiave), (e) => e.pinErrato === true);
  await assert.rejects(apri({ ...busta, iv: await casuali(16) }, segreto.chiave), (e) => e.pinErrato === true);
  await assert.rejects(apri({ ...busta, firma: undefined }, segreto.chiave), (e) => e.pinErrato === true);
  await assert.rejects(apri({ ...busta, formato: 'altro' }, segreto.chiave), /versione/);
  // due file dello stesso backup non sono mai uguali
  assert.notEqual(await proteggi('{}', segreto), await proteggi('{}', segreto));
  assert.ok(!eProtetto({ versione: 2, tabelle: {} }) && !eProtetto(null));
});

test('PIN sul telefono: senza PIN il backup resta leggibile, con il PIN è cifrato e torna identico', async () => {
  await db.salvaFornitore({ ragione_sociale: 'Fornitore di prova però' });
  await db.menuScrivi([['state', JSON.stringify({ menus: [{ client: 'Rossi 😀', date: '2026-10-17' }] })]]);
  assert.equal(await pinImpostato(), false);
  const dump = await db.esportaTutto();
  const uguale = JSON.parse(JSON.stringify(dump));
  const inChiaro = await testoBackup(dump);
  assert.deepEqual(JSON.parse(inChiaro), uguale);
  assert.deepEqual((await leggiBackup(inChiaro)).dump, uguale);

  await impostaPin('135790');
  assert.equal(await pinImpostato(), true);
  assert.equal(await verificaPin('135790'), true);
  assert.equal(await verificaPin('135791'), false);
  assert.equal(Number(await db.leggiPreferenza('pin_giri')), GIRI);

  const protetto = await testoBackup(dump);
  assert.ok(eProtetto(JSON.parse(protetto)) && !protetto.includes('Fornitore di prova'));
  // stesso telefono: si apre senza digitare il PIN
  const r = await leggiBackup(protetto);
  assert.deepEqual(r.dump, uguale);
  await db.importaTutto(r.dump);
  assert.equal((await db.listaFornitori()).length, 1);
  assert.equal(await db.menuLeggi('state'), JSON.stringify({ menus: [{ client: 'Rossi 😀', date: '2026-10-17' }] }));

  // il PIN e la sua chiave non finiscono mai dentro il backup
  assert.ok(!JSON.stringify(dump).includes(await db.leggiPreferenza('pin_chiave')));
  assert.equal(dump.tabelle.preferenze, undefined);

  // PIN cambiato: i file di prima chiedono il PIN vecchio
  await impostaPin('999000');
  assert.deepEqual(await leggiBackup(protetto), { servePin: true, generato: dump.generato });
  await assert.rejects(leggiBackup(protetto, '999000'), (e) => e.pinErrato === true);
  const vecchio = await leggiBackup(protetto, '135790');
  assert.deepEqual(vecchio.dump, uguale);
  assert.equal(vecchio.adottato, false);
  assert.equal(await verificaPin('999000'), true, 'aprire un file vecchio non cambia il PIN del telefono');

  // telefono nuovo (nessun PIN): il PIN del backup diventa quello del telefono
  for (const k of ['pin_sale', 'pin_chiave', 'pin_giri']) await db.salvaPreferenza(k, null);
  assert.equal(await pinImpostato(), false);
  assert.equal((await leggiBackup(protetto)).servePin, true);
  assert.equal((await leggiBackup(protetto, '135790')).adottato, true);
  assert.equal(await verificaPin('135790'), true);
  assert.ok((await leggiBackup(protetto)).dump, 'ora si apre senza chiedere il PIN');

  await assert.rejects(leggiBackup('non è json'), /non è un backup valido/);
});
