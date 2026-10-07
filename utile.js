/**
 * Conversioni di numeri e date usate da tutta l'app (nessuna dipendenza: si provano in Node).
 * Regola: il "giorno" è sempre quello del telefono, mai quello UTC di toISOString().
 */

/** Testo digitato → numero. Accetta la virgola ("0,5") e il punto. Vuoto o non valido: null. */
export function aNumero(testo) {
  if (testo === null || testo === undefined) return null;
  if (typeof testo === 'number') return Number.isFinite(testo) ? testo : null;
  const s = String(testo).replace(/\s/g, '').replace(',', '.');
  if (s === '' || s === '-' || s === '.' || s === '-.') return null;
  if (!/^-?\d*\.?\d*$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Numero → testo per i campi, con la virgola. */
export const numeroPerCampo = (n) => (n === null || n === undefined || n === '' ? '' : String(n).replace('.', ','));

const due = (n) => String(n).padStart(2, '0');

/** Data (oggetto Date) → AAAA-MM-GG secondo l'orologio del telefono. */
export const isoLocale = (d) => `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}`;

/** Oggi, AAAA-MM-GG, secondo l'orologio del telefono. */
export const oggiLocale = () => isoLocale(new Date());

/** AAAA-MM-GG → Date a mezzogiorno locale (lontano dai cambi di giorno e di ora legale). */
export const daIsoLocale = (iso) => {
  const [a, m, g] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(a, m - 1, g, 12, 0, 0, 0);
};

/** AAAA-MM-GG più (o meno) n giorni. */
export const piuGiorni = (iso, n) => {
  const d = daIsoLocale(iso || oggiLocale());
  d.setDate(d.getDate() + Number(n));
  return isoLocale(d);
};

/** Giorno locale (AAAA-MM-GG) di un istante salvato (ISO con orario) o di una data semplice. */
export const giornoDi = (iso) => {
  if (!iso) return null;
  const s = String(iso);
  return s.length <= 10 ? s : isoLocale(new Date(s));
};

/**
 * Istanti UTC di inizio (compreso) e fine (esclusa) dei giorni locali da "da" ad "a":
 * servono per cercare nel database le registrazioni di un periodo senza sbagliare giorno.
 */
export const limitiGiorni = (da, a = da) => {
  const [a1, m1, g1] = String(da).slice(0, 10).split('-').map(Number);
  const [a2, m2, g2] = String(a).slice(0, 10).split('-').map(Number);
  return [new Date(a1, m1 - 1, g1, 0, 0, 0, 0).toISOString(), new Date(a2, m2 - 1, g2 + 1, 0, 0, 0, 0).toISOString()];
};

/** Arrotonda le quantità a tre decimali (grammi su un chilo). */
export const arrotonda = (n) => Math.round(Number(n) * 1000) / 1000;

/** Testo sicuro dentro l'HTML di stampe ed etichette. */
export const escHtml = (v) => (v === null || v === undefined ? '' : String(v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
