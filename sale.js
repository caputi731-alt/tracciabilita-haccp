/**
 * Le due sale mensa di Tenuta Coppa e la disposizione delle tavolate. Solo dati e calcolo, senza telefono
 * (provato in test/sale.test.mjs). La scena 3D è la pagina sale/index.html, la schermata è SaleScreen.js.
 *
 * Si parte dalla prenotazione (scelta di Luca: "riempiamo la sala in base alle prenotazioni"): nome, persone e ora.
 * Dalle persone si ricava quanto deve essere LUNGA la tavolata (80 cm a persona); con quali tavoli e allunghe comporla
 * lo decide chi apparecchia, perché i tavoli hanno lunghezze diverse. La lunghezza si può correggere a mano.
 * Ogni sala ha delle FILE fisse dove stanno i tavoli, già fuori dai passaggi e dalle zone libere davanti alle porte:
 * le posizioni lungo la fila le calcola `disponi`.
 *
 * Misure in metri, ricavate dalle piante e confermate da Luca sul disegno dell'8/10/2026 (restano stime: ±20%).
 * Coordinate di ogni sala: x verso destra, y verso il basso, come nel disegno visto dall'alto.
 */

export const LARGO = 0.9;           // profondità dei tavoli
export const A_PERSONA = 0.8;       // 80 cm di tavolo a persona sui lati lunghi (scelta di Luca: non devono stare stretti)
export const TRA_TAVOLI = 1.2;      // fra due tavolate della stessa fila: sedie più passaggio
export const DAVANTI_PORTA = 1.5;   // zona libera davanti a ogni porta
export const LUNGA_MIN = 0.6, LUNGA_MAX = 14;

const rett = (x, y, w, h) => ({ x, y, w, h });

/**
 * - contorno: i muri, visti dall'alto; ostacoli: pilastri e paravento (niente tavoli);
 * - porte: { x1, y1, x2, y2, nome } sul muro; zone: rettangoli lasciati liberi davanti alle porte;
 * - file: dove stanno i tavoli. asse 'x' = fila orizzontale nel disegno ('y' = verticale), `c` = centro della fila
 *   sull'altro asse, `tratti` = pezzi di fila utilizzabili [da, a] lungo l'asse.
 */
export const SALE = {
  panoramica: {
    id: 'panoramica', nome: 'Sala panoramica', sigla: 'P',
    contorno: [[0, 0], [2.9, 0], [2.9, 1.3], [6.5, 1.3], [6.5, 10], [0, 10]],
    ostacoli: [{ ...rett(3.95, 1.3, 1.55, 1.7), nome: 'Paravento' }],
    porte: [
      { x1: 2.45, y1: 10, x2: 3.95, y2: 10, nome: 'Ingresso' },
      { x1: 3.95, y1: 1.4, x2: 3.95, y2: 2.6, nome: 'Cucina' },
      { x1: 6.5, y1: 2.4, x2: 6.5, y2: 3.2, nome: 'Bagni' },
    ],
    zone: [rett(2.25, 8.5, 1.9, 1.5), rett(2.45, 1.3, 1.5, 1.7), rett(5.0, 2.2, 1.5, 1.2), rett(5.5, 1.3, 1.0, 0.9)],
    file: [
      { id: 'A', nome: 'Fila A · finestre', asse: 'y', c: 1.25, tratti: [[0.8, 9.2]] },
      { id: 'B', nome: 'Fila B · lato cucina', asse: 'y', c: 4.85, tratti: [[3.8, 8.4]] },
    ],
  },
  stalla: {
    id: 'stalla', nome: 'Sala antica stalla', sigla: 'S',
    contorno: [[0, 0], [15.8, 0], [15.8, 6.5], [0, 6.5]],
    ostacoli: [
      rett(2.8, 0, 0.5, 0.5), rett(5.7, 0, 0.6, 0.5), rett(8.6, 0, 0.5, 0.5), rett(11.4, 0, 0.5, 0.5), rett(14.1, 0, 0.4, 0.5),
      rett(2.8, 6.0, 0.6, 0.5), rett(5.7, 6.0, 1.1, 0.5), rett(8.15, 6.0, 1.65, 0.5), rett(11.5, 6.0, 0.5, 0.5), rett(14.1, 6.1, 0.4, 0.4),
    ],
    // l'ingresso è solo quello di sinistra, vicino alle scale; verso la cucina conta solo la porta in fondo (scelte di Luca)
    porte: [
      { x1: 6.8, y1: 6.5, x2: 8.15, y2: 6.5, nome: 'Ingresso' },
      { x1: 14.7, y1: 0, x2: 15.8, y2: 0, nome: 'Cucina' },
      { x1: 1.0, y1: 0, x2: 2.1, y2: 0, nome: 'Bagni' },
    ],
    zone: [rett(6.6, 5.0, 1.75, 1.5), rett(14.5, 0, 1.3, 1.5), rett(0.8, 0, 1.5, 1.5)],
    file: [
      { id: 'A', nome: 'Fila A · lato cucina', asse: 'x', c: 1.75, tratti: [[2.5, 14.3]] },
      { id: 'B', nome: 'Fila B · lato ingresso', asse: 'x', c: 4.75, tratti: [[0.8, 6.4], [8.55, 15.0]] },
    ],
  },
};
export const ID_SALE = Object.keys(SALE);
export const SERVIZI = ['Pranzo', 'Cena'];

const intero = (n) => Math.max(0, Math.floor(Number(n) || 0));
const arrotonda = (n) => Math.round(n * 1000) / 1000 + 0;   // + 0: mai "-0"
const decimo = (n) => Math.round(n * 10) / 10;

/**
 * Stima realistica dei posti di una tavolata lunga `len`: una persona ogni 80 cm su ognuno dei due lati lunghi, più un
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
  return decimo(Math.max(1.2, Math.ceil((n - 2) / 2) * A_PERSONA));
}

/** Lunghezza di una tavolata: quella corretta a mano, se c'è, altrimenti quella calcolata dalle persone. */
export function lunghezza(t) {
  const m = Number(t && t.len);
  if (Number.isFinite(m) && m > 0) return decimo(Math.min(LUNGA_MAX, Math.max(LUNGA_MIN, m)));
  return lunghezzaPer(t && t.persone);
}

let contatore = 0;
/** Nuova tavolata; l'id serve solo a riconoscerla sullo schermo. `len` null = calcolata dalle persone. */
export const nuovaTavolata = (dati = {}) => ({
  id: `t${Date.now().toString(36)}${(contatore++).toString(36)}`, nome: '', persone: '', ora: '', note: '', len: null, ...dati,
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
      ora: String(t.ora || ''), note: String(t.note || ''), len,
    };
  }));
  // tavolate di file che la sala non ha più: finiscono in coda all'ultima fila, così non si perdono
  letto.slice(sala.file.length).forEach((f) => { if (Array.isArray(f) && file.length) file[file.length - 1].push(...pianoPulito({ file: [0] }, { file: [f] }).file[0]); });
  return { file };
}

/** Lo stesso piano senza prenotazioni, con le lunghezze fissate: è quello che si salva come modello. */
export const senzaPrenotazioni = (sala, p) => ({
  file: pianoPulito(sala, p).file.map((f) => f.map((t) => nuovaTavolata({ len: lunghezza(t) }))),
});

/**
 * Mette in fila le tavolate nei tratti utilizzabili, nell'ordine in cui sono: ognuna nel primo tratto dove entra ancora,
 * con almeno 1,2 m dalla precedente; lo spazio che avanza in un tratto si divide in parti uguali.
 * → [{ t, da, a }] più quelle che non entrano (`fuori`).
 */
function sistema(fila, tavolate) {
  const messe = [], fuori = [];
  let k = 0, usato = 0, quante = 0;
  const gruppi = fila.tratti.map(() => []);
  tavolate.forEach((t) => {
    const len = lunghezza(t);
    while (k < fila.tratti.length) {
      const spazio = fila.tratti[k][1] - fila.tratti[k][0];
      if (usato + (quante ? TRA_TAVOLI : 0) + len <= spazio + 1e-9) break;
      k += 1; usato = 0; quante = 0;
    }
    if (k >= fila.tratti.length) { fuori.push(t); return; }
    usato += (quante ? TRA_TAVOLI : 0) + len; quante += 1;
    gruppi[k].push(t);
  });
  gruppi.forEach((g, i) => {
    if (!g.length) return;
    const [da, a] = fila.tratti[i];
    const somma = g.reduce((s, t) => s + lunghezza(t), 0);
    const avanza = (a - da) - somma - (g.length - 1) * TRA_TAVOLI;
    const parte = avanza / (g.length + 1);
    let p = da + parte;
    g.forEach((t) => { const len = lunghezza(t); messe.push({ t, da: p, a: p + len }); p += len + TRA_TAVOLI + parte; });
  });
  return { messe, fuori };
}

/** Una tavolata lunga `len` entra ancora in quella fila, dopo quelle che ci sono? (`senza` = id di una da non contare) */
export function entra(sala, piano, f, len, senza = null) {
  const fila = sala.file[f];
  if (!fila) return false;
  const altre = pianoPulito(sala, piano).file[f].filter((t) => t.id !== senza);
  return sistema(fila, [...altre, { len }]).fuori.length === 0;
}

/** La tavolata più lunga che si può ancora aggiungere a una fila (0 se non entra più niente). */
export function restoFila(sala, piano, f, senza = null) {
  let a = 0, b = LUNGA_MAX;
  if (!entra(sala, piano, f, LUNGA_MIN, senza)) return 0;
  for (let i = 0; i < 12; i++) { const m = (a + b) / 2; if (entra(sala, piano, f, m, senza)) a = m; else b = m; }
  return Math.floor(a * 10 + 1e-6) / 10;
}

/**
 * Dove va ogni tavolata.
 * → { tavolate: [{ ...prenotazione, fila, sigla, asse, x, y (centro), len, posti, lati, capotavola, numeroPersone,
 *      prenotata, troppi }], problemi: [testi], ok }
 * Le sigle (P1, P2… S1…) sono in ordine di fila e di arrivo: servono ai camerieri per trovare il tavolo.
 */
export function disponi(sala, piano) {
  const file = pianoPulito(sala, piano).file;
  const problemi = [], tavolate = [];
  let numero = 0;
  const nomi = {};
  file.forEach((f) => f.forEach((t) => { numero += 1; nomi[t.id] = `${sala.sigla}${numero}`; }));
  file.forEach((lista, i) => {
    const fila = sala.file[i];
    const { messe, fuori } = sistema(fila, lista);
    fuori.forEach((t) => problemi.push(`${nomi[t.id]}${t.nome ? ` ${t.nome}` : ''} non entra nella ${fila.nome.split(' · ')[0].toLowerCase()}: spostala o accorciala`));
    messe.forEach(({ t, da, a }) => {
      const len = lunghezza(t), p = posti(len), persone = intero(t.persone), centro = (da + a) / 2;
      tavolate.push({
        ...t, fila: i, sigla: nomi[t.id], asse: fila.asse, x: arrotonda(fila.asse === 'x' ? centro : fila.c), y: arrotonda(fila.asse === 'x' ? fila.c : centro),
        len, ...p, numeroPersone: persone, prenotata: !!(t.nome.trim() || persone), troppi: persone > p.posti,
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
  pianoPulito(sala, piano).file.forEach((f) => f.forEach((t) => { n += 1; out[t.id] = `${sala.sigla}${n}`; }));
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

export const metri = (n) => `${String(decimo(n)).replace('.', ',')} m`;

/** Quello che serve alla pagina 3D: la sala com'è fatta e le tavolate già messe al loro posto. */
export function datiScenaSala(sala, piano, { scuro = false, scelto = null } = {}) {
  const d = disponi(sala, piano);
  return {
    sala: { id: sala.id, nome: sala.nome, contorno: sala.contorno, ostacoli: sala.ostacoli, porte: sala.porte, zone: sala.zone },
    tavolate: d.tavolate.map((t) => ({
      id: t.id, x: t.x, y: t.y, len: t.len, asse: t.asse, lati: t.lati, capotavola: t.capotavola,
      titolo: t.nome.trim() ? `${t.sigla} · ${t.nome.trim()}` : t.sigla,
      breve: t.prenotata ? `${t.numeroPersone || '?'} pers. · ${metri(t.len)}${t.ora ? ` · ${t.ora}` : ''}` : `libera · ${metri(t.len)}`,
      c: t.troppi ? 'crit' : t.prenotata ? 'ok' : 'neutro',
    })),
    scuro: !!scuro, scelto,
  };
}
