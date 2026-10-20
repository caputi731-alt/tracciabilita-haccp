/**
 * Ricerca in tutta l'app (schermata "Cerca", CercaScreen.js; proposta A del 20/10/2026, fase 2).
 * Modulo puro (provato in test/cerca.test.mjs): riceve i dati già letti e dice cosa mostrare.
 *
 * Gruppi del risultato, in quest'ordine:
 * - prodotti: con la giacenza sommata dai lotti disponibili (anche cercando il numero di lotto o il fornitore);
 * - ricette;
 * - portate dell'archivio del Menù;
 * - sezioni dell'app (cercaSezioni di sezioni.js, sinonimi compresi).
 * Le "usate di recente" sono gli id delle ultime sezioni aperte (preferenza locale, non va nel backup).
 */
import { cercaSezioni, semplifica, SEZIONI_SUITE } from './sezioni';

export const MAX_RECENTI = 5;
const MAX_PER_GRUPPO = 6;

/** Ogni parola cercata deve trovarsi (anche come inizio di parola o dentro) in uno dei testi. 0 = non c'entra. */
function punteggio(testi, parole) {
  const [titolo, ...resto] = testi.map(semplifica);
  let tot = 0;
  for (const p of parole) {
    if (titolo.split(' ').some((w) => w.startsWith(p))) tot += 3;
    else if (titolo.includes(p)) tot += 2;
    else if (resto.some((r) => r.includes(p))) tot += 1;
    else return 0;
  }
  return tot;
}

const ordina = (righe) => righe
  .filter((r) => r.p > 0)
  .sort((a, b) => b.p - a.p || String(a.v.nome).localeCompare(String(b.v.nome), 'it'))
  .slice(0, MAX_PER_GRUPPO)
  .map((r) => r.v);

/**
 * Prodotti con la loro giacenza: un prodotto per riga anche se ha più lotti (e più unità di misura: si mostra quella
 * del lotto che scade prima). `lottoTrovato` è il lotto il cui numero corrisponde a quello cercato.
 */
export function prodottiConGiacenza(prodotti = [], lotti = []) {
  const per = new Map();
  for (const p of prodotti) {
    if (!p) continue;
    per.set(p.id, { id: p.id, nome: p.denominazione || '', categoria: p.categoria || '', conservazione: p.conservazione || '',
      fornitore: p.fornitore || '', lotti: [], totale: 0, unita: '', scadenza: null });
  }
  for (const l of lotti) {
    if (!l || l.stato && l.stato !== 'disponibile') continue;
    let r = per.get(l.prodotto_id);
    if (!r) {
      r = { id: l.prodotto_id, nome: l.prodotto || '', categoria: l.categoria || '', conservazione: l.conservazione || '',
        fornitore: '', lotti: [], totale: 0, unita: '', scadenza: null };
      per.set(l.prodotto_id, r);
    }
    r.lotti.push(l);
  }
  for (const r of per.values()) {
    r.lotti.sort((a, b) => (a.data_scadenza || '9999') < (b.data_scadenza || '9999') ? -1 : 1);
    const primo = r.lotti[0];
    if (primo) {
      r.unita = primo.unita_misura || '';
      r.scadenza = primo.data_scadenza || null;
      r.totale = r.lotti.filter((l) => (l.unita_misura || '') === r.unita)
        .reduce((t, l) => t + (Number(l.quantita_residua) || 0), 0);
      r.totale = Math.round(r.totale * 1000) / 1000;
    }
  }
  return [...per.values()];
}

/** Portate dell'archivio del Menù dal testo salvato dall'app web; [] se non si legge. */
export function portateDelMenu(testoStato) {
  try {
    const stato = typeof testoStato === 'string' ? JSON.parse(testoStato) : testoStato;
    return (stato && Array.isArray(stato.dishes) ? stato.dishes : [])
      .filter((d) => d && d.name)
      .map((d) => ({ id: d.id, nome: String(d.name).replace(/\s+/g, ' ').trim(), categoria: d.cat || '', ricettaId: d.rid || null }));
  } catch (e) {
    return [];
  }
}

/**
 * Tutto quello che corrisponde al testo cercato. Testo vuoto = gruppi vuoti.
 * @returns {{ prodotti: object[], ricette: object[], portate: object[], sezioni: object[], totale: number }}
 */
export function cercaTutto(testo, { prodotti = [], ricette = [], portate = [] } = {}) {
  const parole = semplifica(testo).split(' ').filter(Boolean);
  const vuoto = { prodotti: [], ricette: [], portate: [], sezioni: [], totale: 0 };
  if (!parole.length) return vuoto;

  const prod = ordina(prodotti.map((v) => {
    const numeri = v.lotti.map((l) => l.numero_lotto).filter(Boolean);
    const p = punteggio([v.nome, v.categoria, v.fornitore, ...v.lotti.map((l) => l.fornitore || ''), ...numeri], parole);
    if (!p) return { v, p };
    // se la ricerca è un numero di lotto, quel lotto si apre direttamente
    const lottoTrovato = v.lotti.find((l) => l.numero_lotto && parole.every((w) => semplifica(l.numero_lotto).includes(w))) || null;
    return { v: { ...v, lottoTrovato }, p };
  }));
  const ric = ordina(ricette.filter(Boolean).map((r) => ({ v: { id: r.id, nome: r.nome || '', categoria: r.categoria || '' },
    p: punteggio([r.nome || '', r.categoria || ''], parole) })));
  const por = ordina(portate.map((d) => ({ v: d, p: punteggio([d.nome, d.categoria], parole) })));
  const sez = cercaSezioni(testo).slice(0, MAX_PER_GRUPPO);
  return { prodotti: prod, ricette: ric, portate: por, sezioni: sez, totale: prod.length + ric.length + por.length + sez.length };
}

const PER_ID = Object.fromEntries(SEZIONI_SUITE.map((s) => [s.id, s]));

/** Legge le sezioni usate di recente (testo JSON con gli id): ignora id sconosciuti e doppi, non si rompe mai. */
export function leggiRecenti(testo) {
  let lista = [];
  try { lista = JSON.parse(testo || '[]'); } catch (e) { lista = []; }
  if (!Array.isArray(lista)) return [];
  return [...new Set(lista.filter((id) => typeof id === 'string' && PER_ID[id]))].slice(0, MAX_RECENTI);
}

/** Mette in cima una sezione appena aperta; ne restano al massimo MAX_RECENTI. */
export function aggiungiRecente(lista, id) {
  if (!PER_ID[id]) return lista;
  return [id, ...lista.filter((x) => x !== id)].slice(0, MAX_RECENTI);
}

/** Le voci delle sezioni recenti, nell'ordine. */
export const vociRecenti = (lista) => lista.map((id) => PER_ID[id]).filter(Boolean);
