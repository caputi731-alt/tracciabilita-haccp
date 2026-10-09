/**
 * Le due sale mensa di Tenuta Coppa e la disposizione delle tavolate. Solo dati e calcolo, senza telefono
 * (provato in test/sale.test.mjs). La scena 3D è la pagina sale/index.html, la schermata è SaleScreen.js.
 *
 * Si parte dalla prenotazione (scelta di Luca: "riempiamo la sala in base alle prenotazioni"): nome, persone e ora.
 * Dalle persone si ricava quanto deve essere LUNGA la tavolata (75 cm a persona); con quali tavoli e allunghe comporla
 * lo decide chi apparecchia, perché i tavoli hanno lunghezze diverse. La lunghezza si può correggere a mano.
 * Ogni sala ha delle FILE fisse dove stanno i tavoli, già fuori dai passaggi e dalle zone libere davanti alle porte.
 * Una prenotazione sta sempre su una fila: riceve il primo posto libero e si sposta (trascinandola) lungo la fila, su
 * un'altra fila o nell'altra sala; non si può lasciare in un punto qualsiasi.
 *
 * Misure in metri, ricavate dalle piante e confermate da Luca sul disegno dell'8/10/2026 (restano stime: ±20%).
 * Coordinate di ogni sala: x verso destra, y verso il basso, come nel disegno visto dall'alto.
 */

export const LARGO = 0.9;           // profondità dei tavoli
export const A_PERSONA = 0.75;      // 75 cm di tavolo a persona sui lati lunghi (scelta di Luca)
export const TRA_TAVOLI = 1.2;      // fra due tavolate della stessa fila: sedie più passaggio
export const DAVANTI_PORTA = 1.5;   // zona libera davanti a ogni porta
export const LUNGA_MIN = 0.6, LUNGA_MAX = 14;

const rett = (x, y, w, h) => ({ x, y, w, h });

/**
 * - contorno: i muri, visti dall'alto; ostacoli: pilastri e paravento (niente tavoli);
 * - porte: { x1, y1, x2, y2, nome } sul muro; zone: rettangoli lasciati liberi davanti alle porte;
 * - file: dove stanno i tavoli. asse 'x' = fila orizzontale nel disegno ('y' = verticale), `c` = centro della fila
 *   sull'altro asse, `tratti` = pezzi di fila utilizzabili [da, a] lungo l'asse; `seconda` = fila usata solo ogni tanto:
 *   una prenotazione nuova ci finisce da sola soltanto se nelle altre non c'è posto.
 */
export const SALE = {
  // lunga 17 m (9/10/2026): Luca dice che è più lunga di come l'avevo stimata e che a destra dell'ingresso, in un'unica
  // tavolata, stanno 21 persone (7,5 m); l'allungamento è tutto verso il fondo, dove c'è la porta della cucina
  stalla: {
    id: 'stalla', nome: 'Sala antica stalla', sigla: 'S',
    contorno: [[0, 0], [17, 0], [17, 6.5], [0, 6.5]],
    ostacoli: [
      rett(2.8, 0, 0.5, 0.5), rett(5.7, 0, 0.6, 0.5), rett(8.6, 0, 0.5, 0.5), rett(11.4, 0, 0.5, 0.5), rett(14.3, 0, 0.5, 0.5),
      rett(2.8, 6.0, 0.6, 0.5), rett(5.7, 6.0, 1.1, 0.5), rett(8.15, 6.0, 1.65, 0.5), rett(11.5, 6.0, 0.5, 0.5), rett(14.3, 6.0, 0.5, 0.5),
    ],
    // l'ingresso è solo quello di sinistra, vicino alle scale; verso la cucina conta solo la porta in fondo (scelte di Luca)
    porte: [
      { x1: 6.8, y1: 6.5, x2: 8.15, y2: 6.5, nome: 'Ingresso' },
      { x1: 15.9, y1: 0, x2: 17, y2: 0, nome: 'Cucina' },
      { x1: 1.0, y1: 0, x2: 2.1, y2: 0, nome: 'Bagni' },
    ],
    zone: [rett(6.6, 5.0, 1.75, 1.5), rett(15.7, 0, 1.3, 1.5), rett(0.8, 0, 1.5, 1.5)],
    file: [
      { id: 'A', nome: 'Fila A · lato cucina', asse: 'x', c: 1.75, tratti: [[2.5, 15.5]] },
      { id: 'B', nome: 'Fila B · lato ingresso', asse: 'x', c: 4.75, tratti: [[0.8, 6.4], [8.55, 16.2]] },
    ],
  },
  // larga 7 m (scelta di Luca del 9/10/2026: la fila centrale ci sta); oltre alle tre file verticali ci sono tre file
  // orizzontali, parallele all'ingresso, da usare insieme alle altre in zone diverse della sala ("miste")
  panoramica: {
    id: 'panoramica', nome: 'Sala panoramica', sigla: 'P',
    contorno: [[0, 0], [3.1, 0], [3.1, 1.3], [7, 1.3], [7, 10], [0, 10]],
    ostacoli: [{ ...rett(4.25, 1.3, 1.65, 1.7), nome: 'Paravento' }],
    porte: [
      { x1: 2.65, y1: 10, x2: 4.25, y2: 10, nome: 'Ingresso' },
      { x1: 4.25, y1: 1.4, x2: 4.25, y2: 2.6, nome: 'Cucina' },
      { x1: 7, y1: 2.4, x2: 7, y2: 3.2, nome: 'Bagni' },
    ],
    zone: [rett(2.45, 8.5, 2.0, 1.5), rett(2.75, 1.3, 1.5, 1.7), rett(5.5, 2.2, 1.5, 1.2), rett(5.9, 1.3, 1.1, 0.9)],
    file: [
      { id: 'A', nome: 'Fila A · finestre', asse: 'y', c: 1.25, tratti: [[0.8, 9.2]] },
      // la B resta la seconda: i piani salvati prima della fila centrale tengono le prenotazioni dove erano
      { id: 'B', nome: 'Fila B · lato cucina', asse: 'y', c: 5.75, tratti: [[3.8, 9.2]] },
      { id: 'C', nome: 'Fila C · centrale', asse: 'y', c: 3.5, tratti: [[3.4, 8.2]] },
      { id: 'D', nome: 'Fila D · orizzontale in alto', asse: 'x', c: 3.9, tratti: [[0.8, 5.3]], seconda: true },
      { id: 'E', nome: 'Fila E · orizzontale al centro', asse: 'x', c: 6.0, tratti: [[0.8, 6.2]], seconda: true },
      { id: 'F', nome: 'Fila F · orizzontale verso l\'ingresso', asse: 'x', c: 7.75, tratti: [[0.8, 6.2]], seconda: true },
    ],
  },
};
export const ID_SALE = Object.keys(SALE);
export const SERVIZI = ['Pranzo', 'Cena'];

const intero = (n) => Math.max(0, Math.floor(Number(n) || 0));
const arrotonda = (n) => Math.round(n * 1000) / 1000 + 0;   // + 0: mai "-0"
const decimo = (n) => Math.round(n * 10) / 10;
const decimoInSu = (n) => Math.ceil(n * 10 - 1e-6) / 10;

/**
 * Stima realistica dei posti di una tavolata lunga `len`: una persona ogni 75 cm su ognuno dei due lati lunghi, più un
 * capotavola per testa. Sotto 1,2 m (il tavolo da 90 da solo) si sta al massimo in 3, non in 4 (scelta di Luca).
 * → { posti, lati (persone per lato lungo), capotavola }
 */
export function posti(len) {
  const l = Number(len) || 0;
  if (l < LUNGA_MIN - 1e-9) return { posti: 0, lati: 0, capotavola: 0 };
  if (l < 1.2 - 1e-9) return { posti: 3, lati: 1, capotavola: 1 };
  const lati = Math.floor(l / A_PERSONA + 1e-9);
  return { posti: lati * 2 + 2, lati, capotavola: 2 };
}

/** Quanto deve essere lunga la tavolata per quel numero di persone (la più corta in cui stanno comode). */
export function lunghezzaPer(persone) {
  const n = intero(persone);
  if (n <= 3) return 0.9;
  return decimoInSu(Math.max(1.2, Math.ceil((n - 2) / 2) * A_PERSONA));
}

/** Lunghezza di una tavolata: quella corretta a mano, se c'è, altrimenti quella calcolata dalle persone. */
export function lunghezza(t) {
  const m = Number(t && t.len);
  if (Number.isFinite(m) && m > 0) return decimo(Math.min(LUNGA_MAX, Math.max(LUNGA_MIN, m)));
  return lunghezzaPer(t && t.persone);
}

let contatore = 0;
/** Nuova tavolata; l'id serve solo a riconoscerla sullo schermo. `len` null = calcolata dalle persone;
 *  `p` = dove comincia lungo la sua fila (metri, null finché non ha un posto). */
export const nuovaTavolata = (dati = {}) => ({
  id: `t${Date.now().toString(36)}${(contatore++).toString(36)}`, nome: '', persone: '', ora: '', note: '', len: null, p: null, ...dati,
});

export const pianoVuoto = (sala) => ({ file: sala.file.map(() => []) });

/**
 * Ripulisce il piano di una sala letto dal database o da un modello: una lista di tavolate per ogni fila della sala.
 * Legge anche i piani della prima versione (build 83), dove una tavolata era "tanti tavoli da 180 e da 90".
 */
export function pianoPulito(sala, p) {
  const letto = (p && Array.isArray(p.file)) ? p.file : [];
  const file = sala.file.map((_, i) => (Array.isArray(letto[i]) ? letto[i] : []).filter((t) => t && typeof t === 'object').map((t) => {
    const vecchia = intero(t.t180) * 1.8 + intero(t.t90) * 0.9;
    const len = Number(t.len) > 0 ? decimo(Number(t.len)) : vecchia > 0 ? decimo(vecchia) : null;
    return {
      id: String(t.id || nuovaTavolata().id), nome: String(t.nome || ''), persone: intero(t.persone) ? String(intero(t.persone)) : '',
      ora: String(t.ora || ''), note: String(t.note || ''), len, p: Number.isFinite(Number(t.p)) && t.p !== null && t.p !== '' ? decimo(Number(t.p)) : null,
    };
  }));
  // tavolate di file che la sala non ha più: finiscono in coda all'ultima fila, così non si perdono
  letto.slice(sala.file.length).forEach((f) => { if (Array.isArray(f) && file.length) file[file.length - 1].push(...pianoPulito({ file: [0] }, { file: [f] }).file[0]); });
  return { file };
}

/** Lo stesso piano senza prenotazioni, con le lunghezze fissate: è quello che si salva come modello. */
export const senzaPrenotazioni = (sala, p) => ({
  file: sistemaPiano(sala, p).file.map((f) => f.map((t) => nuovaTavolata({ len: lunghezza(t), p: t.p }))),
});

/* ---------- il posto di ogni tavolata ----------
   Ogni tavolata ha un posto suo lungo la fila (`p`, dove comincia): lo riceve quando viene aggiunta (il primo libero) e lo
   cambia solo quando Luca la sposta. Due tavolate, della stessa fila o di file che si incrociano (nella panoramica quelle
   orizzontali attraversano quelle verticali), devono restare ad almeno 1,2 m una dall'altra. */

/** Il rettangolo occupato da una tavolata (senza sedie) messa in `p` lungo la fila. */
export const ingombro = (fila, p, len) => (fila.asse === 'x' ? { x: p, y: fila.c - LARGO / 2, w: len, h: LARGO } : { x: fila.c - LARGO / 2, y: p, w: LARGO, h: len });

const distanti = (a, b) => Math.max(Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w)), Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h))) >= TRA_TAVOLI - 1e-6;

/** Quel posto è dentro un tratto della fila e abbastanza lontano da tutto quello che c'è già (`presi` = ingombri)? */
function libero(fila, presi, p, len) {
  if (!fila.tratti.some(([da, a]) => p >= da - 1e-6 && p + len <= a + 1e-6)) return false;
  const r = ingombro(fila, p, len);
  return presi.every((q) => distanti(r, q));
}

/** Il posto libero più vicino a `vicino` (dove dovrebbe cominciare), o il primo della fila se `vicino` manca; null se non c'è. */
function cercaPosto(fila, presi, len, vicino = null) {
  let meglio = null;
  for (const [da, a] of fila.tratti) {
    for (let p = da; p + len <= a + 1e-6; p = decimo(p + 0.1)) {
      if (!libero(fila, presi, p, len)) continue;
      if (vicino === null) return decimo(p);
      if (meglio === null || Math.abs(p - vicino) < Math.abs(meglio - vicino)) meglio = decimo(p);
    }
    // anche a filo della fine del tratto, che non sempre cade su un decimo
    const fine = decimo(a - len);
    if (fine >= da - 1e-6 && libero(fila, presi, fine, len) && (meglio === null || (vicino !== null && Math.abs(fine - vicino) < Math.abs(meglio - vicino)))) meglio = fine;
  }
  return meglio;
}

/**
 * Il piano con ogni tavolata al suo posto: chi ha già un posto valido lo tiene, alle altre (piani vecchi, tavolata
 * allungata che non ci sta più) si dà il primo libero; chi non entra da nessuna parte resta con `p` null.
 * Dentro ogni fila le tavolate sono in ordine di posto.
 */
export function sistemaPiano(sala, piano) {
  const file = pianoPulito(sala, piano).file.map((f) => f.map((t) => ({ ...t })));
  const presi = [];
  const daMettere = [];
  // prima quelle che hanno un posto valido, poi le altre: una tavolata senza posto non ne sposta una che ce l'ha
  file.forEach((lista, i) => lista.forEach((t) => {
    const len = lunghezza(t);
    if (t.p !== null && libero(sala.file[i], presi, t.p, len)) presi.push(ingombro(sala.file[i], t.p, len));
    else { t.p = null; daMettere.push([t, i]); }
  }));
  daMettere.forEach(([t, i]) => {
    const len = lunghezza(t);
    const p = cercaPosto(sala.file[i], presi, len);
    if (p !== null) { t.p = p; presi.push(ingombro(sala.file[i], p, len)); }
  });
  file.forEach((lista) => lista.sort((a, b) => (a.p === null) - (b.p === null) || a.p - b.p));
  return { file };
}

const ingombri = (sala, file, senza = null) => file.flatMap((lista, i) => lista.filter((t) => t.id !== senza && t.p !== null)
  .map((t) => ingombro(sala.file[i], t.p, lunghezza(t))));

/**
 * Mette una tavolata in una fila: nel posto libero più vicino a `centro` (il punto, lungo la fila, dove dovrebbe stare il suo
 * centro), o nel primo libero se `centro` manca. Se la tavolata c'era già (stesso id) viene tolta da dov'era: serve per
 * aggiungere, spostare, allungare. → il piano nuovo, oppure null se in quella fila non c'è posto.
 */
export function metti(sala, piano, f, tavolata, centro = null) {
  const fila = sala.file[f];
  if (!fila) return null;
  const file = sistemaPiano(sala, piano).file.map((lista) => lista.filter((t) => t.id !== tavolata.id));
  const len = lunghezza(tavolata);
  const p = cercaPosto(fila, ingombri(sala, file), len, centro === null ? null : centro - len / 2);
  if (p === null) return null;
  file[f] = [...file[f], { ...tavolata, p }].sort((a, b) => (a.p === null) - (b.p === null) || a.p - b.p);
  return { file };
}

/**
 * Il posto migliore per una tavolata nuova lunga `len`: lo spazio libero più piccolo in cui entra, così i tratti lunghi
 * restano per i gruppi grandi; a parità, la prima fila. Dentro lo spazio va all'inizio, accanto a quello che c'è già.
 * → { f, p, avanza (metri che restano liberi in quello spazio) } oppure null se non entra da nessuna parte.
 */
export function postoMigliore(sala, piano, len) {
  const presi = ingombri(sala, sistemaPiano(sala, piano).file);
  let meglio = null;
  // prima le file di tutti i giorni; quelle segnate `seconda` (le orizzontali della panoramica, usate ogni tanto) solo se serve
  [false, true].forEach((seconda) => { if (meglio) return; sala.file.forEach((fila, f) => { if (!!fila.seconda === seconda) fila.tratti.forEach(([da, a]) => {
    let inizio = null, ultimo = null;
    const chiudi = () => {
      if (inizio === null) return;
      const avanza = decimo(ultimo - inizio);            // di quanto si può ancora spostare dentro questo spazio
      if (!meglio || avanza < meglio.avanza - 1e-9) meglio = { f, p: inizio, avanza };
      inizio = null;
    };
    for (let p = da; p + len <= a + 1e-6; p = decimo(p + 0.1)) {
      if (libero(fila, presi, p, len)) { if (inizio === null) inizio = decimo(p); ultimo = decimo(p); } else chiudi();
    }
    chiudi();
  }); }); });
  return meglio;
}

/** Il piano senza quella tavolata. */
export const togli = (sala, piano, id) => ({ file: sistemaPiano(sala, piano).file.map((lista) => lista.filter((t) => t.id !== id)) });

/** Dove si trova una tavolata: { f (fila), t } oppure null. */
export function trova(sala, piano, id) {
  const file = sistemaPiano(sala, piano).file;
  for (let f = 0; f < file.length; f++) { const t = file[f].find((x) => x.id === id); if (t) return { f, t }; }
  return null;
}

/** Una tavolata lunga `len` entra ancora in quella fila? (`senza` = id di una da non contare, per esempio lei stessa) */
export function entra(sala, piano, f, len, senza = null) {
  const fila = sala.file[f];
  if (!fila) return false;
  return cercaPosto(fila, ingombri(sala, sistemaPiano(sala, piano).file, senza), len) !== null;
}

/** La tavolata più lunga che si può ancora mettere in una fila (0 se non entra più niente). */
export function restoFila(sala, piano, f, senza = null) {
  const fila = sala.file[f];
  if (!fila) return 0;
  const presi = ingombri(sala, sistemaPiano(sala, piano).file, senza);
  if (cercaPosto(fila, presi, LUNGA_MIN) === null) return 0;
  let a = LUNGA_MIN, b = LUNGA_MAX;
  for (let i = 0; i < 12; i++) { const m = (a + b) / 2; if (cercaPosto(fila, presi, Math.floor(m * 10) / 10 || LUNGA_MIN) !== null) a = m; else b = m; }
  return Math.floor(a * 10 + 1e-6) / 10;
}

/** La fila della sala più vicina a un punto (dove si lascia una tavolata trascinata): { f, centro } lungo quella fila. */
export function filaVicina(sala, x, y) {
  let meglio = null;
  sala.file.forEach((fila, f) => {
    const lungo = fila.asse === 'x' ? x : y, traverso = fila.asse === 'x' ? y : x;
    fila.tratti.forEach(([da, a]) => {
      const d = Math.hypot(traverso - fila.c, lungo < da ? da - lungo : lungo > a ? lungo - a : 0);
      if (!meglio || d < meglio.d) meglio = { f, centro: Math.min(a, Math.max(da, lungo)), d };
    });
  });
  return meglio;
}

/**
 * Dove va ogni tavolata.
 * → { tavolate: [{ ...prenotazione, fila, sigla, asse, x, y (centro), len, posti, lati, capotavola, numeroPersone,
 *      prenotata, troppi }], problemi: [testi], ok }
 * Le sigle (S1, S2… P1…) sono in ordine di fila e di posto: servono ai camerieri per trovare il tavolo.
 */
export function disponi(sala, piano) {
  const file = sistemaPiano(sala, piano).file;
  const problemi = [], tavolate = [];
  let numero = 0;
  file.forEach((lista, i) => {
    const fila = sala.file[i];
    lista.forEach((t) => {
      numero += 1;
      const sigla = `${sala.sigla}${numero}`;
      if (t.p === null) { problemi.push(`${sigla}${t.nome ? ` ${t.nome}` : ''} non entra nella ${fila.nome.split(' · ')[0].toLowerCase()}: spostala o accorciala`); return; }
      const len = lunghezza(t), po = posti(len), persone = intero(t.persone), centro = t.p + len / 2;
      tavolate.push({
        ...t, fila: i, sigla, asse: fila.asse, x: arrotonda(fila.asse === 'x' ? centro : fila.c), y: arrotonda(fila.asse === 'x' ? fila.c : centro),
        len, ...po, numeroPersone: persone, prenotata: !!(t.nome.trim() || persone), troppi: persone > po.posti,
      });
    });
  });
  tavolate.filter((t) => t.troppi).forEach((t) => problemi.push(`${t.sigla}${t.nome ? ` ${t.nome}` : ''}: ${t.numeroPersone} persone su ${t.posti} posti`));
  return { tavolate, problemi, ok: problemi.length === 0 };
}

/** Sigla di ogni tavolata: { id: sigla }. */
export function sigle(sala, piano) {
  const out = {};
  let n = 0;
  sistemaPiano(sala, piano).file.forEach((f) => f.forEach((t) => { n += 1; out[t.id] = `${sala.sigla}${n}`; }));
  return out;
}

/** Totali di una o più sale: { tavolate, prenotate, posti, persone, metri (di tavolo da preparare) }. `coppie` = [[sala, piano]]. */
export function totali(coppie) {
  const out = { tavolate: 0, prenotate: 0, posti: 0, persone: 0, metri: 0 };
  coppie.forEach(([sala, piano]) => pianoPulito(sala, piano).file.forEach((f) => f.forEach((t) => {
    const len = lunghezza(t);
    out.tavolate += 1; out.posti += posti(len).posti; out.persone += intero(t.persone); out.metri = decimo(out.metri + len);
    if (t.nome.trim() || intero(t.persone)) out.prenotate += 1;
  })));
  return out;
}

/**
 * Le sedie da disegnare intorno a una tavolata: tante quante le persone prenotate (o i posti, se è libera).
 * Prima si riempiono i due lati lunghi, fino ai posti che hanno, poi i capotavola; chi è di troppo va ancora sui lati.
 * → { a, b (sedie sui due lati lunghi), teste (0, 1 o 2) }: a + b + teste è sempre il numero chiesto.
 */
export function sedie(quante, len) {
  const n = intero(quante), po = posti(len);
  const suiLati = Math.min(n, po.lati * 2);
  const teste = Math.min(po.capotavola, n - suiLati);
  const resto = n - teste;
  return { a: Math.ceil(resto / 2), b: Math.floor(resto / 2), teste };
}

export const metri = (n) => `${String(decimo(n)).replace('.', ',')} m`;

/** Quello che serve alla pagina 3D per una sala: com'è fatta (con le file, per trascinare) e le tavolate al loro posto. */
export function datiScenaSala(sala, piano, { scuro = false, scelto = null } = {}) {
  const d = disponi(sala, piano);
  return {
    sala: { id: sala.id, nome: sala.nome, contorno: sala.contorno, ostacoli: sala.ostacoli, porte: sala.porte, zone: sala.zone, file: sala.file },
    tavolate: d.tavolate.map((t) => ({
      id: t.id, x: t.x, y: t.y, len: t.len, asse: t.asse, sedie: sedie(t.prenotata && t.numeroPersone ? t.numeroPersone : t.posti, t.len),
      titolo: t.nome.trim() ? `${t.sigla} · ${t.nome.trim()}` : t.sigla,
      breve: t.prenotata ? `${t.numeroPersone || '?'} pers. · ${metri(t.len)}${t.ora ? ` · ${t.ora}` : ''}` : `libera · ${metri(t.len)}`,
      c: t.troppi ? 'crit' : t.prenotata ? 'ok' : 'neutro',
    })),
    scuro: !!scuro, scelto,
  };
}

/** Più sale insieme, una accanto all'altra (telefono in orizzontale): `coppie` = [[sala, piano]]. */
export const datiScenaSale = (coppie, opzioni = {}) => {
  const parti = coppie.map(([sala, piano]) => datiScenaSala(sala, piano, opzioni));
  return { sale: parti.map((d) => ({ sala: d.sala, tavolate: d.tavolate })), scuro: !!opzioni.scuro, scelto: opzioni.scelto || null };
};
