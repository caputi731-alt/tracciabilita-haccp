// Sale: stima dei posti, tavolate dalle prenotazioni, posizioni nelle file (sale.js) e salvataggio di giornate e modelli (database.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SALE, posti, lunghezzaPer, lunghezza, entra, restoFila, pianoVuoto, pianoPulito, sistemaPiano, senzaPrenotazioni, disponi, sigle, totali,
  datiScenaSala, datiScenaSale, nuovaTavolata, metti, togli, trova, filaVicina, postoMigliore, ingombro, sedie, TRA_TAVOLI, LARGO,
} from '../sale.js';
import {
  initDatabase, disposizioneGiorno, salvaDisposizioneGiorno, giorniConPrenotazioni, modelliSale, salvaModelloSale, eliminaModelloSale,
  esportaTutto, importaTutto,
} from '../database.js';

const T = (persone, altro = {}) => nuovaTavolata({ persone: persone ? String(persone) : '', ...altro });
const { stalla, panoramica } = SALE;
const dentro = (p, r) => p.x >= r.x - 1e-9 && p.x <= r.x + r.w + 1e-9 && p.y >= r.y - 1e-9 && p.y <= r.y + r.h + 1e-9;
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

test('sedie: tante quante le persone prenotate, prima sui lati e poi a capotavola', () => {
  assert.deepEqual(sedie(10, 3), { a: 4, b: 4, teste: 2 });
  assert.deepEqual(sedie(7, 2.3), { a: 3, b: 3, teste: 1 });      // 7 persone su una tavolata da 8 posti: 7 sedie, non 8
  assert.deepEqual(sedie(4, 1.2), { a: 1, b: 1, teste: 2 });
  assert.deepEqual(sedie(3, 0.9), { a: 1, b: 1, teste: 1 });
  assert.deepEqual(sedie(2, 0.9), { a: 1, b: 1, teste: 0 });
  assert.deepEqual(sedie(1, 3), { a: 1, b: 0, teste: 0 });
  assert.deepEqual(sedie(0, 3), { a: 0, b: 0, teste: 0 });
  assert.deepEqual(sedie(8, 1.8), { a: 3, b: 3, teste: 2 });      // più persone dei posti: le sedie in più vanno sui lati
  for (let n = 0; n <= 40; n++) for (const len of [0.9, 1.2, 2.3, 5.5]) { const q = sedie(n, len); assert.equal(q.a + q.b + q.teste, n); }
  // nella scena: la tavolata prenotata ha le sedie delle persone, quella libera le sedie dei posti
  const s = datiScenaSala(stalla, { file: [[T(7), nuovaTavolata({ len: 2.3 })]] });
  assert.deepEqual(s.tavolate.map((t) => t.sedie.a + t.sedie.b + t.sedie.teste), [7, 8]);
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

/** Un piano con quelle tavolate aggiunte una alla volta: [[fila, tavolata], …]. */
const piano = (sala, aggiunte) => aggiunte.reduce((p, [f, t]) => { const n = metti(sala, p, f, t); assert.ok(n, `non entra nella fila ${f}`); return n; }, pianoVuoto(sala));
const controlla = (sala, d) => {
  const rett = d.tavolate.map((t) => ingombro(sala.file[t.fila], t.p, t.len));
  rett.forEach((r, i) => {
    [...sala.ostacoli, ...sala.zone].forEach((o) => assert.ok(!siToccano(r, o), `${d.tavolate[i].sigla} in un posto vietato`));
    rett.slice(i + 1).forEach((q, j) => assert.ok(!siToccano(r, q, TRA_TAVOLI - 0.01), `${d.tavolate[i].sigla} e ${d.tavolate[i + 1 + j].sigla} troppo vicine`));
  });
};

test('ogni prenotazione ha un posto suo: il primo libero, distanziata, mai sopra pilastri o davanti alle porte', () => {
  for (const sala of [stalla, panoramica]) {
    const p = piano(sala, [[0, T(10, { nome: 'Rossi', ora: '13:00' })], [0, T(4)], [0, T(6)], [1, T(6)]]);
    const d = disponi(sala, p);
    assert.ok(d.ok, d.problemi.join('; '));
    assert.equal(d.tavolate.length, 4);
    controlla(sala, d);
    assert.deepEqual(Object.values(sigle(sala, p)), [1, 2, 3, 4].map((n) => `${sala.sigla}${n}`));
    assert.deepEqual([d.tavolate[0].sigla, d.tavolate[0].len, d.tavolate[0].posti, d.tavolate[0].prenotata], [`${sala.sigla}1`, 3, 10, true]);
    // il posto resta quello: aggiungere un'altra prenotazione non sposta le prime
    const dopo = disponi(sala, metti(sala, p, 1, T(2)));
    d.tavolate.forEach((t) => assert.equal(dopo.tavolate.find((x) => x.id === t.id).p, t.p));
  }
  // nella stalla la fila dell'ingresso è spezzata in due: una tavolata troppo lunga per la sinistra va a destra,
  // ma la fila non è piena e la prossima torna a sinistra (errore visto da Luca nella build 84)
  const lunga = piano(stalla, [[1, nuovaTavolata({ len: 6.4 })]]);
  assert.equal(restoFila(stalla, lunga, 1), 5.6);
  const d = disponi(stalla, metti(stalla, lunga, 1, T(10)));
  assert.ok(d.ok);
  const destra = d.tavolate.find((t) => t.len === 6.4), sinistra = d.tavolate.find((t) => t.len === 3);
  assert.ok(destra.p >= 8.55 - 1e-6 && sinistra.p + 3 <= 6.4 + 1e-6);
  // l'antica stalla viene per prima; a destra dell'ingresso, in un'unica tavolata, stanno 21 persone (detto da Luca)
  assert.deepEqual(Object.keys(SALE), ['stalla', 'panoramica']);
  const [sx, dx] = stalla.file[1].tratti.map(([da, a]) => a - da);
  assert.ok(dx > sx);
  const ventuno = metti(stalla, pianoVuoto(stalla), 1, T(21));
  assert.ok(ventuno && disponi(stalla, ventuno).tavolate[0].p >= 8.55 - 1e-6);
  assert.equal(disponi(stalla, ventuno).tavolate[0].posti, 22);
  assert.equal(metti(stalla, pianoVuoto(stalla), 1, T(24, { p: 9 }), 12), null);   // 24 non ci stanno più
});

test('panoramica: fila centrale e file orizzontali, che si incrociano senza sovrapporsi', () => {
  // lungo le finestre, a sinistra dell'ingresso, entrano 28 persone in un'unica tavolata (dato di Luca)
  assert.ok(entra(panoramica, pianoVuoto(panoramica), 0, lunghezzaPer(28)));
  assert.equal(posti(lunghezzaPer(28)).posti, 28);
  assert.deepEqual(panoramica.file.map((f) => f.asse), ['y', 'y', 'y', 'x', 'x', 'x']);
  assert.equal(Math.max(...panoramica.contorno.map((q) => q[0])), 7);
  // le tre file verticali piene stanno insieme
  const verticali = piano(panoramica, [[0, T(28)], [1, T(20)], [2, T(18)]]);
  const d = disponi(panoramica, verticali);
  assert.ok(d.ok);
  controlla(panoramica, d);
  assert.deepEqual(d.tavolate.map((t) => t.x), [1.25, 5.75, 3.5]);
  // con le verticali piene, le orizzontali che le attraversano non hanno più posto
  assert.deepEqual([3, 4, 5].map((f) => restoFila(panoramica, verticali, f)), [0, 0, 0]);
  assert.equal(metti(panoramica, verticali, 4, T(4)), null);
  // miste: una orizzontale in alto e, più sotto, le verticali accorciate
  const miste = piano(panoramica, [[3, T(10)], [0, nuovaTavolata({ len: 3 })], [2, T(4)]]);
  const m = disponi(panoramica, miste);
  assert.ok(m.ok);
  controlla(panoramica, m);
  assert.deepEqual(m.tavolate.map((t) => t.asse).sort(), ['x', 'y', 'y']);
  const oriz = m.tavolate.find((t) => t.asse === 'x'), vert = m.tavolate.find((t) => t.asse === 'y' && t.len === 3);
  assert.ok(vert.p >= oriz.y + 0.45 + TRA_TAVOLI - 1e-6, 'la verticale comincia sotto la orizzontale');
});

test('una prenotazione nuova va da sola nel posto migliore: lo spazio libero più piccolo in cui entra', () => {
  // sala vuota: 21 persone entrano solo a destra dell'ingresso o nella fila lunga; va dove avanza meno
  let q = postoMigliore(stalla, pianoVuoto(stalla), lunghezzaPer(21));
  assert.deepEqual([q.f, q.p >= 8.55 - 0.06], [1, true]);
  // un tavolo da 4 non va a spezzare la fila lunga: finisce nel tratto più corto
  q = postoMigliore(stalla, pianoVuoto(stalla), lunghezzaPer(4));
  assert.deepEqual([q.f, q.p], [1, 0.8]);
  // fra due spazi liberi sceglie quello che riempie meglio, e ci si mette all'inizio, accanto a quello che c'è già
  const p = piano(stalla, [[1, T(10)], [0, T(30)]]);          // B sinistra: restano 1,4 m; A: restano 1,3 m; B destra libera
  q = postoMigliore(stalla, p, 0.9);
  assert.deepEqual([q.f, q.p], [0, 14.2]);
  assert.ok(disponi(stalla, metti(stalla, p, q.f, T(2), q.p + 0.45)).ok);
  // panoramica: prima le file verticali; quelle orizzontali (usate ogni tanto) solo quando nelle altre non c'è più posto
  q = postoMigliore(panoramica, pianoVuoto(panoramica), 2.3);
  assert.equal(panoramica.file[q.f].asse, 'y');
  const pieneInBasso = [[0, 5], [1, 5], [2, 4]].reduce((x, [f, len]) => metti(panoramica, x, f, nuovaTavolata({ len }), 5.7 + len / 2), pianoVuoto(panoramica));
  q = postoMigliore(panoramica, pieneInBasso, 4);
  assert.equal(panoramica.file[q.f].asse, 'x');
  // non entra da nessuna parte
  assert.equal(postoMigliore(stalla, pianoVuoto(stalla), 13.5), null);
  assert.equal(postoMigliore(panoramica, piano(panoramica, [[0, T(28)], [1, T(20)], [2, T(18)]]), 0.9), null);
});

test('spostare una prenotazione: sulla fila più vicina a dove la si lascia, nel posto libero più vicino', () => {
  const a = T(10, { nome: 'Rossi' }), b = T(6);
  let p = piano(stalla, [[0, a], [0, b]]);
  // lasciata a metà della fila B, a destra dell'ingresso
  let q = filaVicina(stalla, 12, 5.2);
  assert.deepEqual([q.f, q.centro], [1, 12]);
  p = metti(stalla, p, q.f, trova(stalla, p, a.id).t, q.centro);
  let d = disponi(stalla, p);
  assert.deepEqual([trova(stalla, p, a.id).f, d.tavolate.find((t) => t.id === a.id).x], [1, 12]);
  assert.equal(d.tavolate.find((t) => t.id === a.id).nome, 'Rossi');           // la prenotazione viaggia con la tavolata
  assert.equal(d.tavolate.length, 2);
  // lasciata sopra un'altra: va nel posto libero più vicino, non sopra
  q = filaVicina(stalla, 12.2, 4.6);
  p = metti(stalla, p, q.f, trova(stalla, p, b.id).t, q.centro);
  d = disponi(stalla, p);
  assert.ok(d.ok);
  controlla(stalla, d);
  // lasciata fuori dalla fila (davanti all'ingresso): il centro si ferma alla fine del tratto
  assert.deepEqual([filaVicina(stalla, 7.4, 5.5).f, filaVicina(stalla, 7.4, 5.5).centro], [1, 6.4]);
  // da una sala all'altra: si toglie di là e si mette di qua
  const altra = metti(panoramica, pianoVuoto(panoramica), 2, trova(stalla, p, a.id).t, 6);
  p = togli(stalla, p, a.id);
  assert.equal(trova(stalla, p, a.id), null);
  assert.deepEqual([trova(panoramica, altra, a.id).f, disponi(panoramica, altra).tavolate[0].nome], [2, 'Rossi']);
  // se non c'è posto il piano non cambia
  assert.equal(metti(panoramica, altra, 2, T(12)), null);
});

test('disponi: segnala la tavolata che non entra e la prenotazione con più persone dei posti', () => {
  const lunghe = { file: [[T(26), T(14)], []] };       // 9 m + 4,5 m + passaggio in 9,9 m di fila: la seconda resta senza posto
  let d = disponi(panoramica, lunghe);
  assert.ok(!d.ok && d.tavolate.length === 1 && /P2 non entra nella fila a/.test(d.problemi[0]), d.problemi.join('; '));
  d = disponi(panoramica, { file: [[T(4, { nome: 'Bianchi', len: 0.9 })], []] });
  assert.ok(!d.ok && d.tavolate[0].troppi && /P1 Bianchi: 4 persone su 3 posti/.test(d.problemi[0]));
  assert.ok(entra(panoramica, lunghe, 1, 6.9) && !entra(panoramica, lunghe, 1, 7));
  assert.ok(!entra(panoramica, lunghe, 0, 0.9));
  assert.equal(restoFila(panoramica, lunghe, 1), 6.9);
  assert.equal(restoFila(panoramica, { file: [[T(26)]] }, 0), 0);
  // allungando una tavolata, lei stessa non conta
  const una = T(20);
  assert.equal(restoFila(panoramica, piano(panoramica, [[0, una]]), 0, una.id), 9.9);
});

test('piani: pulizia (anche dei piani vecchi), modello senza prenotazioni, totali e dati per la scena', () => {
  const sporco = { file: [[{ nome: 'Verdi', persone: '9', len: '4' }, null, { id: 'x', t180: 2, t90: 1, nome: 'Vecchia', persone: 10 }], 'x', [{ persone: 5, p: 'abc' }]] };
  const p = pianoPulito(panoramica, sporco);
  assert.equal(p.file.length, panoramica.file.length);
  assert.deepEqual(p.file[0].map((t) => [t.nome, t.persone, t.len, t.p]), [['Verdi', '9', 4, null], ['Vecchia', '10', 4.5, null]]);
  assert.deepEqual(p.file[2].map((t) => [t.persone, t.len, t.p]), [['5', null, null]]);
  assert.deepEqual(pianoPulito(stalla, null), pianoVuoto(stalla));
  // i piani salvati senza posto (build 84 e 85) lo ricevono, in ordine; una fila in più della sala finisce nell'ultima
  const s2 = sistemaPiano(stalla, { file: [[T(6), T(6)], [], [T(4)]] });
  assert.deepEqual(s2.file.map((f) => f.map((t) => t.p)), [[2.5, 5.2], [0.8]]);
  const m = senzaPrenotazioni(panoramica, p);
  assert.deepEqual(m.file[0].map((t) => [t.nome, t.persone, t.len]), [['', '', 4], ['', '', 4.5]]);
  assert.equal(m.file[2][0].len, 1.5);
  assert.deepEqual(totali([[panoramica, p], [stalla, { file: [[T(3)]] }]]), { tavolate: 4, prenotate: 4, posti: 12 + 14 + 6 + 3, persone: 27, metri: 10.9 });
  const s = datiScenaSala(panoramica, { file: [[T(9, { nome: 'Verdi', ora: '13:00' })], [nuovaTavolata({ len: 1.8 })]] }, { scuro: true });
  assert.deepEqual([s.tavolate[0].titolo, s.tavolate[0].breve, s.tavolate[0].c, s.tavolate[0].asse], ['P1 · Verdi', '9 pers. · 3 m · 13:00', 'ok', 'y']);
  assert.deepEqual([s.tavolate[1].titolo, s.tavolate[1].breve, s.tavolate[1].c], ['P2', 'libera · 1,8 m', 'neutro']);
  assert.equal(s.sala.contorno.length, 6);
  assert.equal(s.sala.file.length, 6);
  const due = datiScenaSale([[stalla, { file: [[T(4)]] }], [panoramica, { file: [[T(2)]] }]], { scelto: 'z' });
  assert.deepEqual([due.sale.map((q) => q.sala.id), due.sale.map((q) => q.tavolate.length), due.scelto], [['stalla', 'panoramica'], [1, 1], 'z']);
  assert.doesNotThrow(() => JSON.stringify(due));
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
  assert.equal(letto.panoramica.file.length, 6);
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
