/**
 * Incassi e costi: solo calcolo, senza telefono (provato in test/conti.test.mjs). La schermata è IncassiScreen.js.
 *
 * Scelte di Luca (9/10/2026): gli incassi si scrivono un giorno alla volta divisi per metodo di pagamento (contanti, POS, altro),
 * senza distinguere pranzo e cena, e sono IVA inclusa; i costi sono la merce delle fatture caricate (automatica), il personale
 * e le altre spese (scritti a mano). Tutto si vede solo dopo il PIN del titolare.
 */
import { IVA_RISTORAZIONE } from './evento';

export const METODI = [
  { id: 'contanti', nome: 'Contanti' },
  { id: 'pos', nome: 'POS e carte' },
  { id: 'altro', nome: 'Altro (bonifici, buoni)' },
];
export const CATEGORIE_SPESA = ['Personale', 'Altre spese'];

const cent = (n) => Math.round((Number(n) || 0) * 100) / 100;
const due = (n) => String(n).padStart(2, '0');

/** '2026-10' → ['2026-10-01', '2026-10-31']. */
export function limitiMese(mese) {
  const [a, m] = String(mese).split('-').map(Number);
  return [`${a}-${due(m)}-01`, `${a}-${due(m)}-${due(new Date(a, m, 0).getDate())}`];
}

/** Il mese prima (n = -1) o dopo (n = 1): '2026-01', -1 → '2025-12'. */
export function altroMese(mese, n) {
  const [a, m] = String(mese).split('-').map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${due(d.getMonth() + 1)}`;
}

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
export const nomeMese = (mese) => { const [a, m] = String(mese).split('-').map(Number); return `${MESI[m - 1]} ${a}`; };

/** Totale di un giorno di incassi. */
export const totaleIncasso = (r) => cent(METODI.reduce((s, m) => s + (Number(r && r[m.id]) || 0), 0));

/** Toglie l'IVA da un importo che la comprende. */
export const senzaIva = (lordo, iva = IVA_RISTORAZIONE) => cent(lordo / (1 + iva / 100));

/**
 * Il riepilogo di un periodo.
 *  - incassi: [{ giorno, contanti, pos, altro }] (IVA inclusa)
 *  - spese: [{ categoria, importo }] come le ha scritte Luca
 *  - merce: { valore, carichi, senzaPrezzo } dalle fatture caricate (IVA esclusa)
 * → incassato (lordo), perMetodo, netto (senza IVA al 10%), giorni con un incasso, mediaGiorno, costi per voce, totaleCosti,
 *   risultato = netto − costi. Quello che non si può sapere (carichi senza prezzo) resta fuori e viene contato a parte, mai stimato.
 */
export function riepilogoConti({ incassi = [], spese = [], merce = {} }, iva = IVA_RISTORAZIONE) {
  const perMetodo = {};
  METODI.forEach((m) => { perMetodo[m.id] = cent(incassi.reduce((s, r) => s + (Number(r[m.id]) || 0), 0)); });
  const incassato = cent(METODI.reduce((s, m) => s + perMetodo[m.id], 0));
  const giorni = incassi.filter((r) => totaleIncasso(r) > 0).length;
  const netto = senzaIva(incassato, iva);
  const perCategoria = {};
  CATEGORIE_SPESA.forEach((c) => { perCategoria[c] = cent(spese.filter((s) => s.categoria === c).reduce((t, s) => t + (Number(s.importo) || 0), 0)); });
  const costoMerce = cent(merce.valore);
  const totaleCosti = cent(costoMerce + CATEGORIE_SPESA.reduce((s, c) => s + perCategoria[c], 0));
  return {
    incassato, perMetodo, netto, iva, ivaCompresa: cent(incassato - netto), giorni, mediaGiorno: giorni ? cent(incassato / giorni) : 0,
    merce: costoMerce, carichi: Number(merce.carichi) || 0, senzaPrezzo: Number(merce.senzaPrezzo) || 0,
    personale: perCategoria.Personale, altreSpese: perCategoria['Altre spese'], totaleCosti,
    risultato: cent(netto - totaleCosti),
    // quanta parte dell'incasso netto se ne va in merce: il "food cost" del periodo
    incidenzaMerce: netto > 0 ? Math.round(costoMerce / netto * 1000) / 10 : null,
  };
}

export const euro = (n) => {
  const v = cent(n), [i, d] = Math.abs(v).toFixed(2).split('.');
  return `${v < 0 ? '−' : ''}${i.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${d} €`;
};
