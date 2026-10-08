/**
 * Le due sale mensa di Tenuta Coppa e la disposizione guidata dei tavoli. Solo dati e calcolo, senza telefono
 * (provato in test/sale.test.mjs). La scena 3D è la pagina sale/index.html, la schermata è SaleScreen.js.
 *
 * Disposizione guidata (scelta di Luca: quella libera sarebbe confusionaria): ogni sala ha delle FILE parallele al lato
 * lungo; in ogni fila ci sono delle TAVOLATE, cioè uno o più tavoli uniti in linea. Luca sceglie solo quante file,
 * quante tavolate e da quali tavoli è fatta ognuna: le posizioni le calcola `disponi`, rispettando le distanze.
 *
 * Misure in metri. `L` è il lato lungo della sala (lungo cui corrono le file), `W` quello corto.
 */

/** Misure ricavate dalle piante (solo la parte "sala mensa"): sono approssimate e Luca le può correggere dall'app. */
export const SALE = {
  panoramica: { nome: 'Sala panoramica', sigla: 'P', L: 7.3, W: 6.7 },
  stalla: { nome: 'Sala antica stalla', sigla: 'S', L: 15.5, W: 6.0 },
};
export const ID_SALE = Object.keys(SALE);
export const SERVIZI = ['Pranzo', 'Cena'];

export const LARGO = 0.9;           // tutti i tavoli sono profondi 90 cm
export const TAVOLI = { t180: 1.8, t90: 0.9 };
export const A_PERSONA = 0.8;       // 80 cm di tavolo a persona sui lati lunghi (scelta di Luca: non devono stare stretti)
export const DAL_MURO = 0.8;        // nessun tavolo più vicino di così a un muro: devono passare i camerieri
export const TRA_TAVOLI = 1.2;      // fra due file e fra due tavolate della stessa fila: sedie più passaggio
export const MASSIMO_TAVOLI = 8;    // tavoli uniti in una sola tavolata

const intero = (n) => Math.max(0, Math.floor(Number(n) || 0));
const arrotonda = (n) => Math.round(n * 1000) / 1000 + 0;   // + 0: mai "-0"

/** Sala con le misure corrette da Luca (se ci sono) al posto di quelle ricavate dalle piante. */
export function salaCon(id, misure) {
  const base = SALE[id];
  const m = (misure && misure[id]) || {};
  const ok = (v) => Number.isFinite(Number(v)) && Number(v) >= 3 && Number(v) <= 60;
  const a = ok(m.L) ? Number(m.L) : base.L, b = ok(m.W) ? Number(m.W) : base.W;
  return { ...base, id, L: Math.max(a, b), W: Math.min(a, b) };
}

/** Lunghezza di una tavolata (tavoli uniti in linea, prima quelli da 180 poi quelli da 90). */
export const lunghezza = (t) => arrotonda(intero(t && t.t180) * TAVOLI.t180 + intero(t && t.t90) * TAVOLI.t90);

/** I tavoli di una tavolata, in ordine: [1.8, 1.8, 0.9]. */
export const pezzi = (t) => [...Array(intero(t && t.t180)).fill(TAVOLI.t180), ...Array(intero(t && t.t90)).fill(TAVOLI.t90)];

/**
 * Stima realistica dei posti di una tavolata: una persona ogni 80 cm su ognuno dei due lati lunghi, più un capotavola
 * per testa. Un tavolo da 90 da solo fa al massimo 3 posti (scelta di Luca), non 4.
 * → { posti, lati (persone per lato lungo), capotavola }
 */
export function posti(t) {
  const len = lunghezza(t);
  if (len <= 0) return { posti: 0, lati: 0, capotavola: 0 };
  const lati = Math.floor(len / A_PERSONA + 1e-9);
  const capotavola = len <= TAVOLI.t90 ? 1 : 2;
  return { posti: lati * 2 + capotavola, lati, capotavola };
}

/** Margine e intervallo per mettere `n` cose lunghe in tutto `somma` dentro `spazio`, ben distribuite; null se non ci stanno. */
function distribuisci(spazio, somma, n) {
  if (n <= 0) return { margine: spazio / 2, intervallo: 0 };
  const minimo = somma + 2 * DAL_MURO + (n - 1) * TRA_TAVOLI;
  if (minimo > spazio + 1e-9) return null;
  if (n === 1) return { margine: (spazio - somma) / 2, intervallo: 0 };
  // spazio uguale ai lati e fra le cose, se basta per passare; altrimenti il passaggio minimo e il resto ai lati
  const uguale = (spazio - somma) / (n + 1);
  if (uguale >= TRA_TAVOLI) return { margine: uguale, intervallo: uguale };
  return { margine: (spazio - somma - (n - 1) * TRA_TAVOLI) / 2, intervallo: TRA_TAVOLI };
}

/** Quante file parallele entrano nella sala rispettando le distanze. */
export const maxFile = (sala) => Math.max(0, Math.floor((sala.W - 2 * DAL_MURO + TRA_TAVOLI) / (LARGO + TRA_TAVOLI) + 1e-9));

/** Metri di tavolo che si possono ancora aggiungere a una fila (allungando una tavolata che c'è già). */
export function restoFila(sala, fila) {
  const piene = (fila || []).filter((t) => lunghezza(t) > 0);
  const somma = piene.reduce((s, t) => s + lunghezza(t), 0);
  return arrotonda(sala.L - 2 * DAL_MURO - Math.max(0, piene.length - 1) * TRA_TAVOLI - somma);
}

/** Si può aggiungere alla fila una nuova tavolata lunga `len`? (serve anche il passaggio dalla tavolata vicina) */
export function entraTavolata(sala, fila, len) {
  const piene = (fila || []).filter((t) => lunghezza(t) > 0);
  return restoFila(sala, fila) - (piene.length ? TRA_TAVOLI : 0) - len >= -1e-9;
}

export const pianoVuoto = () => ({ file: [] });

let contatore = 0;
/** Nuova tavolata; l'id serve solo a riconoscerla sullo schermo. */
export const nuovaTavolata = (t180 = 1, t90 = 0) => ({
  id: `t${Date.now().toString(36)}${(contatore++).toString(36)}`, t180: intero(t180), t90: intero(t90), nome: '', persone: '', ora: '', note: '',
});

/** Il punto di partenza abituale: due file parallele di tavoli da 180, quanti ne entrano. */
export function pianoBase(sala) {
  const nFile = Math.min(2, maxFile(sala));
  const perFila = Math.max(0, Math.floor((sala.L - 2 * DAL_MURO + TRA_TAVOLI) / (TAVOLI.t180 + TRA_TAVOLI) + 1e-9));
  return { file: Array.from({ length: nFile }, () => Array.from({ length: perFila }, () => nuovaTavolata(1, 0))) };
}

/** Ripulisce un piano letto dal database o da un modello: solo numeri validi, niente file o tavolate vuote. */
export function pianoPulito(p) {
  const file = ((p && Array.isArray(p.file)) ? p.file : []).map((f) => (Array.isArray(f) ? f : [])
    .map((t) => ({
      id: String((t && t.id) || nuovaTavolata().id), t180: intero(t && t.t180), t90: intero(t && t.t90),
      nome: String((t && t.nome) || ''), persone: String((t && t.persone) || ''), ora: String((t && t.ora) || ''), note: String((t && t.note) || ''),
    }))
    .filter((t) => lunghezza(t) > 0))
    .filter((f) => f.length > 0);
  return { file };
}

/** Lo stesso piano senza prenotazioni: è quello che si salva come modello. */
export const senzaPrenotazioni = (p) => ({
  file: pianoPulito(p).file.map((f) => f.map((t) => ({ ...nuovaTavolata(t.t180, t.t90) }))),
});

/**
 * Dove va ogni tavolata. La sala ha il centro in (0, 0): x lungo il lato lungo, z lungo quello corto.
 * → { tavolate: [{ id, fila, posizione, sigla, x, z, len, pezzi, posti, lati, capotavola, nome, persone, ora, note, troppi }],
 *     problemi: [testi], ok }
 * Le sigle (P1, P2… S1…) sono in ordine di fila e di posizione: servono ai camerieri per trovare il tavolo.
 */
export function disponi(sala, piano) {
  const file = pianoPulito(piano).file;
  const problemi = [];
  const traverso = distribuisci(sala.W, file.length * LARGO, file.length);
  if (!traverso) {
    problemi.push(`${file.length} file non entrano nella ${sala.nome.toLowerCase()}: al massimo ${maxFile(sala)}`);
    return { tavolate: [], problemi, ok: false };
  }
  const tavolate = [];
  let numero = 0;
  file.forEach((fila, i) => {
    const somma = fila.reduce((s, t) => s + lunghezza(t), 0);
    const lungo = distribuisci(sala.L, somma, fila.length);
    if (!lungo) {
      problemi.push(`La fila ${i + 1} è troppo lunga: ${String(arrotonda(-restoFila(sala, fila))).replace('.', ',')} m in più dello spazio che c'è`);
      numero += fila.length;
      return;
    }
    const z = -sala.W / 2 + traverso.margine + LARGO / 2 + i * (LARGO + traverso.intervallo);
    let x = -sala.L / 2 + lungo.margine;
    fila.forEach((t, j) => {
      const len = lunghezza(t), p = posti(t);
      const persone = intero(t.persone);
      numero += 1;
      tavolate.push({
        ...t, fila: i, posizione: j, sigla: `${sala.sigla}${numero}`, x: arrotonda(x + len / 2), z: arrotonda(z), len, pezzi: pezzi(t),
        ...p, prenotata: !!(t.nome.trim() || persone), numeroPersone: persone, troppi: persone > p.posti,
      });
      x += len + lungo.intervallo;
    });
  });
  tavolate.filter((t) => t.troppi).forEach((t) => problemi.push(`${t.sigla}${t.nome ? ` ${t.nome}` : ''}: ${t.numeroPersone} persone su ${t.posti} posti`));
  return { tavolate, problemi, ok: problemi.length === 0 };
}

/** Sigla di ogni tavolata (P1, P2… in ordine di fila e di posizione): { id: sigla }. Vale anche se una fila non entra. */
export function sigle(sala, piano) {
  const out = {};
  let n = 0;
  pianoPulito(piano).file.forEach((f) => f.forEach((t) => { n += 1; out[t.id] = `${sala.sigla}${n}`; }));
  return out;
}

/** Totali di una sala (o di più sale sommate): tavoli usati per tipo, posti, persone prenotate, tavolate. */
export function totali(piani) {
  const out = { t180: 0, t90: 0, posti: 0, persone: 0, tavolate: 0, prenotate: 0 };
  [].concat(piani).forEach((p) => pianoPulito(p).file.forEach((f) => f.forEach((t) => {
    out.t180 += t.t180; out.t90 += t.t90; out.posti += posti(t).posti; out.persone += intero(t.persone); out.tavolate += 1;
    if (t.nome.trim() || intero(t.persone)) out.prenotate += 1;
  })));
  return out;
}

/** Quello che serve alla pagina 3D: la sala e le tavolate già messe al loro posto. */
export function datiScenaSala(sala, piano, { scuro = false, scelto = null } = {}) {
  const d = disponi(sala, piano);
  return {
    sala: { id: sala.id, nome: sala.nome, L: sala.L, W: sala.W },
    tavolate: d.tavolate.map((t) => ({
      id: t.id, sigla: t.sigla, x: t.x, z: t.z, len: t.len, pezzi: t.pezzi, lati: t.lati, capotavola: t.capotavola,
      titolo: t.nome.trim() ? `${t.sigla} · ${t.nome.trim()}` : t.sigla,
      breve: t.prenotata ? `${t.numeroPersone || '?'} su ${t.posti}${t.ora ? ` · ${t.ora}` : ''}` : `${t.posti} posti`,
      c: t.troppi ? 'crit' : t.prenotata ? 'ok' : 'neutro',
    })),
    scuro: !!scuro, scelto,
  };
}
