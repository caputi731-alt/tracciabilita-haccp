// Sale: stima dei posti, disposizione guidata dei tavoli (sale.js) e salvataggio di giornate e modelli (database.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SALE, salaCon, posti, lunghezza, pezzi, maxFile, restoFila, entraTavolata, pianoBase, pianoPulito, senzaPrenotazioni,
  disponi, totali, datiScenaSala, nuovaTavolata, DAL_MURO, TRA_TAVOLI, LARGO,
} from '../sale.js';
import {
  initDatabase, disposizioneGiorno, salvaDisposizioneGiorno, modelliSale, salvaModelloSale, eliminaModelloSale,
  misureSale, salvaMisureSale, esportaTutto, importaTutto,
} from '../database.js';

const T = (t180, t90, altro = {}) => ({ ...nuovaTavolata(t180, t90), ...altro });
const stalla = salaCon('stalla'), panoramica = salaCon('panoramica');

test('posti: 80 cm a persona sui lati più i capotavola; il 90 da solo fa 3', () => {
  assert.deepEqual(posti(T(0, 1)), { posti: 3, lati: 1, capotavola: 1 });
  assert.equal(posti(T(1, 0)).posti, 6);
  assert.equal(posti(T(1, 1)).posti, 8);
  assert.equal(posti(T(2, 0)).posti, 10);
  assert.equal(posti(T(3, 0)).posti, 14);
  assert.equal(posti(T(0, 2)).posti, 6);   // due 90 uniti sono lunghi come un 180
  assert.equal(posti(T(0, 0)).posti, 0);
  assert.equal(lunghezza(T(2, 1)), 4.5);
  assert.deepEqual(pezzi(T(2, 1)), [1.8, 1.8, 0.9]);
});

test('misure delle sale: quelle delle piante, corrette da Luca se valide', () => {
  assert.deepEqual([stalla.L, stalla.W], [SALE.stalla.L, SALE.stalla.W]);
  const s = salaCon('stalla', { stalla: { L: 5.5, W: 14 } });
  assert.deepEqual([s.L, s.W], [14, 5.5]);            // il lato lungo è sempre L
  assert.equal(salaCon('stalla', { stalla: { L: 'x', W: 0 } }).L, SALE.stalla.L);
});

test('quante file e quanti tavoli entrano', () => {
  assert.equal(maxFile({ W: 6.0 }), 2);
  assert.equal(maxFile({ W: 6.7 }), 3);
  assert.equal(maxFile({ W: 2.4 }), 0);
  const base = pianoBase(stalla);
  assert.equal(base.file.length, 2);
  assert.equal(base.file[0].length, 5);               // 5 tavoli da 180 con 1,2 m fra loro in 15,5 m
  assert.ok(disponi(stalla, base).ok);
  assert.equal(pianoBase(panoramica).file[0].length, 2);
  assert.ok(entraTavolata(panoramica, [], 1.8));
  assert.ok(!entraTavolata(panoramica, [T(1, 0), T(1, 0)], 0.9));
  assert.equal(restoFila(panoramica, [T(1, 0), T(1, 0)]), 0.9);
});

test('disponi: nessun tavolo vicino al muro, file e tavolate distanziate, niente sovrapposizioni', () => {
  for (const sala of [stalla, panoramica]) {
    const piano = pianoBase(sala);
    piano.file[0] = [T(1, 1, { nome: 'Rossi', persone: '8', ora: '13:00' }), T(1, 0)];
    if (sala === stalla) piano.file[1] = [T(3, 0), T(2, 1)];
    const d = disponi(sala, piano);
    assert.ok(d.ok, d.problemi.join('; '));
    for (const t of d.tavolate) {
      assert.ok(t.x - t.len / 2 >= -sala.L / 2 + DAL_MURO - 2e-3 && t.x + t.len / 2 <= sala.L / 2 - DAL_MURO + 2e-3, `${t.sigla} troppo vicino al muro corto`);
      assert.ok(t.z - LARGO / 2 >= -sala.W / 2 + DAL_MURO - 2e-3 && t.z + LARGO / 2 <= sala.W / 2 - DAL_MURO + 2e-3, `${t.sigla} troppo vicino al muro lungo`);
    }
    d.tavolate.forEach((a, i) => d.tavolate.slice(i + 1).forEach((b) => {
      const dx = Math.abs(a.x - b.x) - (a.len + b.len) / 2, dz = Math.abs(a.z - b.z) - LARGO;
      assert.ok(Math.max(dx, dz) >= TRA_TAVOLI - 2e-3, `${a.sigla} e ${b.sigla} troppo vicini`);
    }));
    assert.deepEqual(d.tavolate.map((t) => t.sigla), d.tavolate.map((_, i) => `${sala.sigla}${i + 1}`));
  }
});

test('disponi: segnala file di troppo, file troppo lunghe e prenotazioni con più persone dei posti', () => {
  let d = disponi(stalla, { file: [[T(1, 0)], [T(1, 0)], [T(1, 0)]] });
  assert.ok(!d.ok && /al massimo 2/.test(d.problemi[0]));
  d = disponi(panoramica, { file: [[T(2, 0), T(2, 0)]] });
  assert.ok(!d.ok && /troppo lunga/.test(d.problemi[0]));
  d = disponi(panoramica, { file: [[T(0, 1, { nome: 'Bianchi', persone: '4' })]] });
  assert.ok(!d.ok && d.tavolate[0].troppi && /4 persone su 3 posti/.test(d.problemi[0]));
  // una fila sola sta al centro della sala
  assert.equal(disponi(panoramica, { file: [[T(1, 0)]] }).tavolate[0].z, 0);
});

test('piani: pulizia, modello senza prenotazioni, totali e dati per la scena', () => {
  const sporco = { file: [[{ t180: '2', t90: -1, nome: 'Verdi', persone: '9' }, { t180: 0, t90: 0 }], [], 'x'] };
  const p = pianoPulito(sporco);
  assert.equal(p.file.length, 1);
  assert.deepEqual([p.file[0][0].t180, p.file[0][0].t90, p.file[0][0].nome], [2, 0, 'Verdi']);
  assert.deepEqual(pianoPulito(null), { file: [] });
  const m = senzaPrenotazioni(p);
  assert.deepEqual([m.file[0][0].t180, m.file[0][0].nome, m.file[0][0].persone], [2, '', '']);
  assert.deepEqual(totali([p, { file: [[T(0, 1)]] }]), { t180: 2, t90: 1, posti: 13, persone: 9, tavolate: 2, prenotate: 1 });
  const s = datiScenaSala(panoramica, p, { scuro: true, scelto: p.file[0][0].id });
  assert.deepEqual([s.tavolate[0].titolo, s.tavolate[0].breve, s.tavolate[0].c], ['P1 · Verdi', '9 su 10', 'ok']);
  assert.equal(datiScenaSala(panoramica, { file: [[T(1, 0)]] }).tavolate[0].breve, '6 posti');
  assert.doesNotThrow(() => JSON.stringify(s));
});

test('database: disposizione di un giorno e di un servizio, modelli con un nome, misure delle sale', async () => {
  await initDatabase();
  assert.equal(await disposizioneGiorno('2026-10-11', 'Pranzo'), null);
  const dati = { panoramica: pianoBase(panoramica), stalla: { file: [[T(2, 0, { nome: 'Battesimo Rossi', persone: '10' })]] } };
  await salvaDisposizioneGiorno('2026-10-11', 'Pranzo', dati);
  dati.stalla.file[0][0].persone = '9';
  await salvaDisposizioneGiorno('2026-10-11', 'Pranzo', dati);      // lo stesso giorno e servizio si aggiorna, non si raddoppia
  await salvaDisposizioneGiorno('2026-10-11', 'Cena', { panoramica: { file: [] }, stalla: { file: [] } });
  const letto = await disposizioneGiorno('2026-10-11', 'Pranzo');
  assert.equal(letto.stalla.file[0][0].persone, '9');
  assert.equal(letto.panoramica.file.length, 2);
  assert.deepEqual((await disposizioneGiorno('2026-10-11', 'Cena')).stalla, { file: [] });
  await assert.rejects(() => salvaDisposizioneGiorno('11/10/2026', 'Pranzo', dati));
  await assert.rejects(() => salvaDisposizioneGiorno('2026-10-11', 'Merenda', dati));

  await salvaModelloSale('Domenica', dati);
  await salvaModelloSale('  domenica ', dati);                       // stesso nome: sostituisce
  await salvaModelloSale('Battesimo 60', dati);
  await assert.rejects(() => salvaModelloSale('  ', dati));
  let modelli = await modelliSale();
  assert.deepEqual(modelli.map((m) => m.nome), ['Battesimo 60', 'domenica']);
  assert.equal(modelli[1].dati.stalla.file[0][0].nome, '');          // nel modello non restano le prenotazioni
  assert.equal(modelli[1].dati.stalla.file[0][0].t180, 2);
  await eliminaModelloSale(modelli[0].id);
  assert.equal((await modelliSale()).length, 1);

  assert.deepEqual(await misureSale(), {});
  await salvaMisureSale({ stalla: { L: 14, W: 5.5 } });
  assert.deepEqual(await misureSale(), { stalla: { L: 14, W: 5.5 } });

  // tutto entra nel backup; un backup precedente alle sale non le cancella
  const dump = await esportaTutto();
  assert.equal(dump.tabelle.disposizioni.length, 4);
  const vecchio = JSON.parse(JSON.stringify(dump));
  delete vecchio.tabelle.disposizioni;
  await importaTutto(vecchio);
  assert.equal((await modelliSale()).length, 1);
});
