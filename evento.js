/**
 * Fabbisogno e costo di un evento del Menù. Solo calcolo, senza database né telefono (provato in test/evento.test.mjs).
 *
 * Ingressi:
 *  - evento: uno degli elementi di eventiMenu() (menuPonte.js): ospiti, bambini, prezzi, portate con ricettaId
 *  - ricette: Map id → { id, nome, porzioni, ingredienti: [{ prodotto_id, quantita, unita_misura }] }
 *  - prodotti: Map id → { id, denominazione, unita_misura, giacenza, prezzo, fornitore }
 *    (giacenza e prezzo sono riferiti all'unità di misura del prodotto; prezzo = ultimo prezzo d'acquisto, IVA esclusa)
 *
 * Regole: ogni ospite mangia tutte le portate del menù. Le portate del menù bambini valgono per i bambini; se il menù
 * bambini non c'è, i bambini contano come adulti. Una portata entra nei conti solo se è collegata a una ricetta con le
 * porzioni e le quantità indicate: quello che manca viene elencato, mai stimato.
 */

/** IVA sulla somministrazione (ristorazione): i prezzi ai clienti la comprendono, i prezzi d'acquisto no. */
export const IVA_RISTORAZIONE = 10;

const FATTORI = { kg: ['peso', 1000], g: ['peso', 1], l: ['volume', 1000], ml: ['volume', 1] };

/** Converte una quantità fra unità compatibili (kg↔g, l↔ml, oppure la stessa unità). Altrimenti null. */
export function converti(quantita, da, a) {
  const q = Number(quantita);
  if (!Number.isFinite(q)) return null;
  const x = String(da || '').trim().toLowerCase();
  const y = String(a || '').trim().toLowerCase();
  if (x === y) return q;
  const fx = FATTORI[x];
  const fy = FATTORI[y];
  if (!fx || !fy || fx[0] !== fy[0]) return null;
  return (q * fx[1]) / fy[1];
}

const tondo = (n, cifre) => { const f = 10 ** cifre; return Math.round((Number(n) + Number.EPSILON) * f) / f; };

/** Quante porzioni servono di ogni portata: restituisce le portate dell'evento con `porzioni`. */
export function porzioniEvento(evento) {
  const adulti = Math.max(0, Number(evento.ospiti) || 0);
  const bambini = Math.max(0, Number(evento.bambini) || 0);
  const menuBambini = (evento.portate || []).some((p) => p.bambini);
  return (evento.portate || []).map((p) => ({
    ...p, porzioni: p.bambini ? bambini : adulti + (menuBambini ? 0 : bambini),
  }));
}

/**
 * Ingredienti di una portata per una porzione, nell'unità del prodotto: { righe: [{ prodotto, quantita }], problemi: [testo] }.
 * `problemi` vuoto = la portata è calcolabile per intero.
 */
function ingredientiPerPorzione(portata, ricette, prodotti) {
  if (!portata.ricettaId) return { righe: [], problemi: ['non è collegata a una ricetta'] };
  const r = ricette.get(portata.ricettaId);
  if (!r) return { righe: [], problemi: ['la ricetta collegata non esiste più'] };
  const ingredienti = (r.ingredienti || []).filter((i) => i.prodotto_id);
  if (!ingredienti.length) return { righe: [], problemi: [`la ricetta "${r.nome}" non ha ingredienti`] };
  const porzioni = Number(r.porzioni);
  if (!(porzioni > 0)) return { righe: [], problemi: [`nella ricetta "${r.nome}" manca il numero di porzioni`] };
  const righe = [];
  const problemi = [];
  for (const ing of ingredienti) {
    const p = prodotti.get(ing.prodotto_id);
    if (!p) { problemi.push('un ingrediente non è più nel catalogo'); continue; }
    if (!(Number(ing.quantita) > 0)) { problemi.push(`manca la quantità di ${p.denominazione}`); continue; }
    const q = converti(ing.quantita, ing.unita_misura || p.unita_misura, p.unita_misura);
    if (q === null) {
      problemi.push(`${p.denominazione}: la ricetta è in ${ing.unita_misura}, il magazzino in ${p.unita_misura}`);
      continue;
    }
    righe.push({ prodotto: p, quantita: q / porzioni });
  }
  return { righe, problemi };
}

/**
 * Cosa serve per l'evento, confrontato con la giacenza.
 * → { righe: [{ prodottoId, nome, unita, serve, giacenza, manca, fornitore }] (ordinate per nome),
 *     daOrdinare: [{ fornitore, righe }], portate: [{ nome, porzioni, bambini, problemi }], incompleto }
 */
export function fabbisogno(evento, ricette, prodotti) {
  const totali = new Map();
  const portate = [];
  for (const p of porzioniEvento(evento)) {
    const { righe, problemi } = ingredientiPerPorzione(p, ricette, prodotti);
    portate.push({ nome: p.nome, porzioni: p.porzioni, bambini: !!p.bambini, problemi });
    for (const r of righe) {
      const t = totali.get(r.prodotto.id) || { prodotto: r.prodotto, serve: 0 };
      t.serve += r.quantita * p.porzioni;
      totali.set(r.prodotto.id, t);
    }
  }
  const righe = [...totali.values()].filter((t) => t.serve > 0).map((t) => {
    const serve = tondo(t.serve, 3);
    const giacenza = tondo(Math.max(0, Number(t.prodotto.giacenza) || 0), 3);
    return {
      prodottoId: t.prodotto.id, nome: t.prodotto.denominazione, unita: t.prodotto.unita_misura || '',
      serve, giacenza, manca: tondo(Math.max(0, serve - giacenza), 3), fornitore: t.prodotto.fornitore || '',
    };
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
  const gruppi = new Map();
  for (const r of righe.filter((x) => x.manca > 0)) {
    const nome = r.fornitore || 'Fornitore non indicato';
    if (!gruppi.has(nome)) gruppi.set(nome, []);
    gruppi.get(nome).push(r);
  }
  const daOrdinare = [...gruppi.entries()].map(([fornitore, rr]) => ({ fornitore, righe: rr }))
    .sort((a, b) => (a.fornitore === 'Fornitore non indicato') - (b.fornitore === 'Fornitore non indicato') || a.fornitore.localeCompare(b.fornitore, 'it'));
  return { righe, daOrdinare, portate, incompleto: portate.some((p) => p.problemi.length > 0) };
}

/**
 * Costo delle materie prime e margine dell'evento.
 * → { portate: [{ nome, bambini, costo (a porzione, somma di ciò che si conosce), problemi }],
 *     costoAdulto, costoBambino, costoTotale, incompleto,
 *     prezzoAdulto, prezzoBambino (IVA compresa, null se non indicati), ricavo (IVA compresa), ricavoNetto,
 *     margine, incidenza (costo / ricavo netto, da 0 a 1) — null quando manca il prezzo }
 */
export function costi(evento, ricette, prodotti, iva = IVA_RISTORAZIONE) {
  const adulti = Math.max(0, Number(evento.ospiti) || 0);
  const bambini = Math.max(0, Number(evento.bambini) || 0);
  const portate = [];
  for (const p of evento.portate || []) {
    const { righe, problemi } = ingredientiPerPorzione(p, ricette, prodotti);
    const tutti = [...problemi];
    let costo = 0;
    for (const r of righe) {
      const prezzo = Number(r.prodotto.prezzo);
      if (r.prodotto.prezzo === null || r.prodotto.prezzo === undefined || !Number.isFinite(prezzo)) {
        tutti.push(`${r.prodotto.denominazione} non ha un prezzo d'acquisto`);
        continue;
      }
      costo += r.quantita * prezzo;
    }
    portate.push({ nome: p.nome, bambini: !!p.bambini, costo: tondo(costo, 2), problemi: tutti });
  }
  const somma = (kids) => portate.filter((p) => p.bambini === kids).reduce((s, p) => s + p.costo, 0);
  const menuBambini = portate.some((p) => p.bambini);
  const costoAdulto = tondo(somma(false), 2);
  const costoBambino = tondo(menuBambini ? somma(true) : somma(false), 2);
  const costoTotale = tondo(costoAdulto * adulti + costoBambino * bambini, 2);
  const numero = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const prezzoAdulto = numero(evento.prezzoAdulti);
  const prezzoBambino = numero(evento.prezzoBambini);
  const out = {
    portate, costoAdulto, costoBambino, costoTotale, incompleto: portate.some((p) => p.problemi.length > 0),
    adulti, bambini, prezzoAdulto, prezzoBambino, iva, ricavo: null, ricavoNetto: null, margine: null, incidenza: null,
    bambiniSenzaPrezzo: bambini > 0 && prezzoBambino === null,
  };
  if (prezzoAdulto !== null && adulti + bambini > 0) {
    out.ricavo = tondo(prezzoAdulto * adulti + (prezzoBambino || 0) * bambini, 2);
    out.ricavoNetto = tondo(out.ricavo / (1 + iva / 100), 2);
    out.margine = tondo(out.ricavoNetto - costoTotale, 2);
    out.incidenza = out.ricavoNetto > 0 ? costoTotale / out.ricavoNetto : null;
  }
  return out;
}

const quantitaIt = (n) => String(tondo(n, 3)).replace('.', ',');

/** Lista d'ordine in testo semplice, da inviare ai fornitori o incollare in un messaggio. */
export function testoOrdine(evento, fab) {
  const righe = [`Da ordinare per ${evento.titolo}${evento.cliente ? ` (${evento.cliente})` : ''} del ${String(evento.data).split('-').reverse().join('/')}`];
  if (!fab.daOrdinare.length) righe.push('', 'Niente da ordinare: la giacenza basta.');
  for (const g of fab.daOrdinare) {
    righe.push('', `${g.fornitore}:`);
    for (const r of g.righe) righe.push(`- ${r.nome}: ${quantitaIt(r.manca)} ${r.unita}`.trimEnd());
  }
  if (fab.incompleto) righe.push('', 'Attenzione: alcune portate non sono nel conto (ricetta mancante o incompleta).');
  return righe.join('\n');
}
