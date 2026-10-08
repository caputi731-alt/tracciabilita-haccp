// Sale: stima dei posti, tavolate dalle prenotazioni, posizioni nelle file (sale.js) e salvataggio di giornate e modelli (database.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SALE, posti, lunghezzaPer, lunghezza, entra, restoFila, pianoVuoto, pianoPulito, senzaPrenotazioni, disponi, sigle, totali,
  datiScenaSala, nuovaTavolata, TRA_TAVOLI, LARGO,
} from '../sale.js';
import {
  initDatabase, disposizioneGiorno, salvaDisposizioneGiorno, giorniConPrenotazioni, modelliSale, salvaModelloSale, eliminaModelloSale,
  esportaTutto, importaTutto,
} from '../database.js';

const T = (persone, altro = {}) => nuovaTavolata({ persone: persone ? String(persone) : '', ...altro });
const { stalla, panoramica } = SALE;
const dentro = (p, r) => p.x >= r.x - 1e-9 && p.x <= r.x + r.w + 1e-9 && p.y >= r.y - 1e-9 && p.y <= r.y + r.h + 1e-9;
/** Il rettangolo occupato da una tavolata (senza sedie). */
const ingombro = (t) => (t.asse === 'x' ? { x: t.x - t.len / 2, y: t.y - LARGO / 2, w: t.len, h: LARGO } : { x: t.x - LARGO / 2, y: t.y - t.len / 2, w: LARGO, h: t.len });
const siToccano = (a, b, aria = 0) => a.x < b.x + b.w + aria - 1e-6 && b.x < a.x + a.w + aria - 1e-6 && a.y < b.y + b.h + aria - 1e-6 && b.y < a.y + a.h + aria - 1e-6;

test('posti: 75 cm a persona sui lati più i capotavola; sotto 1,2 m al massimo in 3', () => {
  assert.deepEqual(posti(0.9), { posti: 3, lati: 1, capotavola: 1 });
  assert.equal(posti(1.1).posti, 3);
  assert.equal(posti(1.2).posti, 4);
  assert.equal(posti(1.5).posti, 6);
  assert.equal(posti(1.8).posti, 6);
  assert.equal(posti(2.3).posti, 8);
  assert.equal(posti(3).posti, 10);
  assert.equal(posti(0.3).posti, 0);
});

test('dalla prenotazione alla lunghezza della tavolata, correggibile a mano', () => {
  assert.deepEqual([1, 3, 4, 5, 6, 7, 8, 10, 20, 30].map(lunghezzaPer), [0.9, 0.9, 1.2, 1.5, 1.5, 2.3, 2.3, 3, 6.8, 10.5]);
  // in ogni tavolata calcolata le persone ci stanno, e in una più corta di 80 cm no
  for (let n = 1; n <= 40; n++) {
    assert.ok(posti(lunghezzaPer(n)).posti >= n, `${n} persone`);
    if (n > 4) assert.ok(posti(lunghezzaPer(n) - 0.8).posti < n, `${n} persone: tavolata troppo lunga`);
  }
  assert.equal(lunghezza(T(10)), 3);
  assert.equal(lunghezza(T(10, { len: 3.6 })), 3.6);
  assert.equal(lunghezza(T(0)), 0.9);
  assert.equal(lunghezza(T(4, { len: 99 })), 14);
});

test('le sale: file dentro i muri, lontane dai muri e fuori da pilastri e zone libere davanti alle porte', () => {
  for (const sala of [stalla, panoramica]) {
    const xs = sala.contorno.map((p) => p[0]), ys = sala.contorno.map((p) => p[1]);
    const W = Math.max(...xs), H = Math.max(...ys);
    assert.equal(sala.porte.length, 3);
    for (const fila of sala.file) {
      for (const [da, a] of fila.tratti) {
        assert.ok(a - da >= 3, `${sala.id} ${fila.id}: tratto troppo corto`);
        const r = fila.asse === 'x' ? { x: da, y: fila.c - LARGO / 2, w: a - da, h: LARGO } : { x: fila.c - LARGO / 2, y: da, w: LARGO, h: a - da };
        assert.ok(r.x >= 0.8 - 1e-9 && r.y >= 0.8 - 1e-9 && r.x + r.w <= W - 0.8 + 1e-9 && r.y + r.h <= H - 0.8 + 1e-9, `${sala.id} ${fila.id}: troppo vicina a un muro`);
        [...sala.ostacoli, ...sala.zone].forEach((o) => assert.ok(!siToccano(r, o), `${sala.id} ${fila.id}: sopra un pilastro o davanti a una porta`));
      }
    }
    // ogni porta ha davanti una zona libera
    sala.porte.forEach((p) => {
      const m = { x: (p.x1 + p.x2) / 2, y: (p.y1 + p.y2) / 2 };
      assert.ok(sala.zone.some((z) => dentro(m, z)), `${sala.id}: ${p.nome} senza zona libera`);
    });
  }
  // la panoramica non è un rettangolo: in alto a destra c'è la cucina
  assert.equal(panoramica.contorno.length, 6);
  // antica stalla: l'ingresso è uno solo, quello di sinistra
  assert.deepEqual(stalla.porte.filter((p) => p.nome === 'Ingresso').map((p) => [p.x1, p.x2]), [[6.8, 8.15]]);
});

test('disponi: tavolate nei tratti, distanziate, mai sopra pilastri o davanti alle porte', () => {
  for (const sala of [stalla, panoramica]) {
    const piano = { file: sala.file.map((f, i) => (i === 0 ? [T(10, { nome: 'Rossi', ora: '13:00' }), T(4), T(6)] : [T(6), T(2)])) };
    const d = disponi(sala, piano);
    assert.ok(d.ok, d.problemi.join('; '));
    assert.equal(d.tavolate.length, 5);
    const ingombri = d.tavolate.map(ingombro);
    ingombri.forEach((r, i) => {
      [...sala.ostacoli, ...sala.zone].forEach((o) => assert.ok(!siToccano(r, o), `${d.tavolate[i].sigla} in un posto vietato`));
      ingombri.slice(i + 1).forEach((q, j) => assert.ok(!siToccano(r, q, TRA_TAVOLI - 0.01), `${d.tavolate[i].sigla} e ${d.tavolate[i + 1 + j].sigla} troppo vicine`));
    });
    assert.deepEqual(Object.values(sigle(sala, piano)), [1, 2, 3, 4, 5].map((n) => `${sala.sigla}${n}`));
    assert.deepEqual([d.tavolate[0].sigla, d.tavolate[0].len, d.tavolate[0].posti, d.tavolate[0].prenotata], [`${sala.sigla}1`, 3, 10, true]);
  }
  // nella stalla la fila dell'ingresso è spezzata in due: una tavolata lunga salta al secondo tratto
  let d = disponi(stalla, { file: [[], [T(12), T(16)]] });
  assert.ok(d.ok);
  assert.ok(d.tavolate[0].x + d.tavolate[0].len / 2 <= 6.4 + 1e-6 && d.tavolate[1].x - d.tavolate[1].len / 2 >= 8.55 - 1e-6);
  // …e il tratto prima dell'ingresso non resta vuoto: una tavolata troppo lunga per la sinistra va a destra,
  // ma la fila non è piena e la prossima torna a sinistra (errore visto da Luca nella build 84)
  const lunga = { file: [[], [nuovaTavolata({ len: 6.4 })]] };
  assert.equal(restoFila(stalla, lunga, 1), 5.6);
  d = disponi(stalla, { file: [[], [...lunga.file[1], T(10)]] });
  assert.ok(d.ok);
  const destra = ingombro(d.tavolate.find((t) => t.len === 6.4)), sinistra = ingombro(d.tavolate.find((t) => t.len === 3));
  assert.ok(destra.x >= 8.55 - 1e-6 && sinistra.x + sinistra.w <= 6.4 + 1e-6);
  // l'antica stalla viene per prima; il tratto a destra dell'ingresso è un po' più lungo di quello a sinistra
  assert.deepEqual(Object.keys(SALE), ['stalla', 'panoramica']);
  const [sx, dx] = stalla.file[1].tratti.map(([da, a]) => a - da);
  assert.ok(dx > sx && dx - sx < 1.5);
});

test('disponi: segnala la tavolata che non entra e la prenotazione con più persone dei posti', () => {
  const piano = { file: [[T(20), T(14)], []] };       // 6,8 m + 4,5 m + passaggio in 8,4 m di fila
  let d = disponi(panoramica, piano);
  assert.ok(!d.ok && d.tavolate.length === 1 && /P2 non entra nella fila a/.test(d.problemi[0]), d.problemi.join('; '));
  d = disponi(panoramica, { file: [[T(4, { nome: 'Bianchi', len: 0.9 })], []] });
  assert.ok(!d.ok && d.tavolate[0].troppi && /P1 Bianchi: 4 persone su 3 posti/.test(d.problemi[0]));
  assert.ok(entra(panoramica, piano, 1, 4.6) && !entra(panoramica, piano, 1, 4.7));
  assert.ok(!entra(panoramica, piano, 0, 0.9));
  assert.equal(restoFila(panoramica, piano, 1), 4.6);
  assert.equal(restoFila(panoramica, { file: [[T(20)], []] }, 0), 0);
  // spostando o allungando una tavolata, lei stessa non conta
  const una = T(20);
  assert.equal(restoFila(panoramica, { file: [[una], []] }, 0, una.id), 8.4);
});

test('piani: pulizia (anche dei piani della prima versione), modello senza prenotazioni, totali e dati per la scena', () => {
  const sporco = { file: [[{ nome: 'Verdi', persone: '9', len: '4' }, null, { id: 'x', t180: 2, t90: 1, nome: 'Vecchia', persone: 10 }], 'x', [{ persone: 5 }]] };
  const p = pianoPulito(panoramica, sporco);
  assert.equal(p.file.length, 2);
  assert.deepEqual(p.file[0].map((t) => [t.nome, t.persone, t.len]), [['Verdi', '9', 4], ['Vecchia', '10', 4.5]]);
  assert.deepEqual(p.file[1].map((t) => [t.persone, t.len]), [['5', null]]);   // la fila in più finisce nell'ultima
  assert.deepEqual(pianoPulito(stalla, null), pianoVuoto(stalla));
  const m = senzaPrenotazioni(panoramica, p);
  assert.deepEqual(m.file[0].map((t) => [t.nome, t.persone, t.len]), [['', '', 4], ['', '', 4.5]]);
  assert.equal(m.file[1][0].len, 1.5);
  assert.deepEqual(totali([[panoramica, p], [stalla, { file: [[T(3)]] }]]), { tavolate: 4, prenotate: 4, posti: 12 + 14 + 6 + 3, persone: 27, metri: 10.9 });
  const s = datiScenaSala(panoramica, { file: [[T(9, { nome: 'Verdi', ora: '13:00' })], [nuovaTavolata({ len: 1.8 })]] }, { scuro: true });
  assert.deepEqual([s.tavolate[0].titolo, s.tavolate[0].breve, s.tavolate[0].c, s.tavolate[0].asse], ['P1 · Verdi', '9 pers. · 3 m · 13:00', 'ok', 'y']);
  assert.deepEqual([s.tavolate[1].titolo, s.tavolate[1].breve, s.tavolate[1].c], ['P2', 'libera · 1,8 m', 'neutro']);
  assert.equal(s.sala.contorno.length, 6);
  assert.doesNotThrow(() => JSON.stringify(s));
});

test('database: disposizione di un giorno e di un servizio, modelli con un nome', async () => {
  await initDatabase();
  assert.equal(await disposizioneGiorno('2026-10-11', 'Pranzo'), null);
  const dati = { panoramica: { file: [[T(6)], []] }, stalla: { file: [[T(10, { nome: 'Battesimo Rossi' })], []] } };
  await salvaDisposizioneGiorno('2026-10-11', 'Pranzo', dati);
  dati.stalla.file[0][0].persone = '9';
  await salvaDisposizioneGiorno('2026-10-11', 'Pranzo', dati);      // lo stesso giorno e servizio si aggiorna, non si raddoppia
  await salvaDisposizioneGiorno('2026-10-11', 'Cena', { panoramica: { file: [] }, stalla: { file: [] } });
  const letto = await disposizioneGiorno('2026-10-11', 'Pranzo');
  assert.equal(letto.stalla.file[0][0].persone, '9');
  assert.equal(letto.panoramica.file.length, 2);
  assert.deepEqual((await disposizioneGiorno('2026-10-11', 'Cena')).stalla, { file: [[], []] });
  assert.deepEqual(await giorniConPrenotazioni('2026-10-01'), [{ data: '2026-10-11', servizio: 'Pranzo', persone: 15, prenotate: 2 }]);
  await assert.rejects(() => salvaDisposizioneGiorno('11/10/2026', 'Pranzo', dati));
  await assert.rejects(() => salvaDisposizioneGiorno('2026-10-11', 'Merenda', dati));

  await salvaModelloSale('Domenica', dati);
  await salvaModelloSale('  domenica ', dati);                       // stesso nome: sostituisce
  await salvaModelloSale('Battesimo 60', dati);
  await assert.rejects(() => salvaModelloSale('  ', dati));
  const modelli = await modelliSale();
  assert.deepEqual(modelli.map((m) => m.nome), ['Battesimo 60', 'domenica']);
  assert.deepEqual([modelli[1].dati.stalla.file[0][0].nome, modelli[1].dati.stalla.file[0][0].len], ['', 3]);  // niente prenotazioni, lunghezza fissata
  await eliminaModelloSale(modelli[0].id);
  assert.equal((await modelliSale()).length, 1);

  // tutto entra nel backup; un backup precedente alle sale non le cancella
  const dump = await esportaTutto();
  assert.equal(dump.tabelle.disposizioni.length, 3);
  const vecchio = JSON.parse(JSON.stringify(dump));
  delete vecchio.tabelle.disposizioni;
  await importaTutto(vecchio);
  assert.equal((await modelliSale()).length, 1);
});
