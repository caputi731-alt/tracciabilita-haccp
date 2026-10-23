/**
 * Stima dei guadagni del mese (Gestione → Incassi, scelte di Luca del 23/10/2026). Modulo puro, provato in test/stima.test.mjs.
 *
 *  - I coperti vengono dalle prenotazioni: tavolate della Sala (confermate) e prenotazioni di Family Wall ancora da confermare,
 *    contate a parte ("di cui da confermare"). Elenco da `prenotazioniCalendario` (familywall.js).
 *  - Adulti, bambini e neonati quando si sanno (note della tavolata "9 adulti, 2 bambini", testo "9+2+1"); altrimenti tutti adulti.
 *  - Prezzo a persona: 50 € adulto, 25 € bambino, 0 € neonato, IVA inclusa; si cambiano in generale e giorno per giorno.
 *    Gli eventi seguono la stessa regola.
 *  - I giorni con un incasso registrato usano l'incasso vero; gli altri la stima.
 *  - Margine stimato = incasso senza IVA − merce a una percentuale scelta (30% se non cambiata). Accanto, la percentuale
 *    calcolata sui mesi prima (merce caricata ÷ incassi senza IVA). Personale e altre spese non entrano: è una stima, non il conto.
 */
import { IVA_RISTORAZIONE } from './evento';

export const PREZZI_BASE = { adulto: 50, bambino: 25, neonato: 0 };
export const MERCE_BASE = 30;

const cent = (n) => Math.round((Number(n) || 0) * 100) / 100;
const intero = (n) => Math.max(0, parseInt(n, 10) || 0);

/** Prezzi validi: numeri ≥ 0, quelli mancanti presi da `base`. */
export function prezziPuliti(p, base = PREZZI_BASE) {
  const out = {};
  for (const k of Object.keys(PREZZI_BASE)) {
    const v = p && p[k] !== null && p[k] !== undefined && p[k] !== '' ? Number(p[k]) : NaN;
    out[k] = Number.isFinite(v) && v >= 0 ? cent(v) : base[k];
  }
  return out;
}

/** Percentuale della merce valida (0–100), altrimenti quella di partenza. */
export const mercePulita = (v) => {
  const n = v === null || v === undefined || v === '' ? NaN : Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 10) / 10 : MERCE_BASE;
};

const numeroVicino = (testo, parola) => {
  const m = new RegExp(`(\\d+)\\s*${parola}`, 'i').exec(String(testo || ''));
  return m ? intero(m[1]) : 0;
};

/**
 * Adulti, bambini e neonati di una prenotazione. Il totale è sempre `persone`: bambini e neonati vengono dalle note
 * ("2 bambini", "1 neonato") o dai campi già letti; gli adulti sono il resto.
 */
export function composizione(p) {
  const persone = intero(p && p.persone);
  let bambini = intero(p && p.bambini) || numeroVicino(p && p.note, 'bambin[oi]');
  let neonati = intero(p && p.neonati) || numeroVicino(p && p.note, 'neonat[oi]');
  if (bambini + neonati > persone) { bambini = Math.min(bambini, persone); neonati = Math.min(neonati, persone - bambini); }
  return { adulti: persone - bambini - neonati, bambini, neonati, persone };
}

export const valoreCoperti = (c, prezzi) =>
  cent(c.adulti * prezzi.adulto + c.bambini * prezzi.bambino + c.neonati * prezzi.neonato);

const somma = (a, b) => ({ adulti: a.adulti + b.adulti, bambini: a.bambini + b.bambini, neonati: a.neonati + b.neonati, persone: a.persone + b.persone });
const ZERO = { adulti: 0, bambini: 0, neonati: 0, persone: 0 };

/**
 * La stima del mese.
 *  - giorni: tutti i giorni del mese ['2026-10-01', …]
 *  - prenotazioni: elenco di `prenotazioniCalendario` (data, servizio, nome, persone, note, bambini, neonati, daConfermare)
 *  - incassi: righe della tabella incassi (giorno, contanti, pos, altro)
 *  - prezzi: { base: { adulto, bambino, neonato }, giorni: { '2026-10-25': { adulto, … } } }
 *  - merce: percentuale della merce sull'incasso senza IVA
 * → { giorni: [solo quelli con prenotazioni o incasso], coperti, daConfermare (coperti), lordo, lordoDaConfermare, reale,
 *    stimato, netto, costoMerce, margine, merce, giorniReali, giorniStimati }
 */
export function stimaMese({ giorni = [], prenotazioni = [], incassi = [], prezzi = {}, merce = MERCE_BASE }, iva = IVA_RISTORAZIONE) {
  const base = prezziPuliti(prezzi.base);
  const perGiorno = (prezzi && prezzi.giorni) || {};
  const veri = {};
  for (const r of incassi) {
    const t = cent((Number(r.contanti) || 0) + (Number(r.pos) || 0) + (Number(r.altro) || 0));
    if (t > 0) veri[r.giorno] = t;
  }
  const out = [];
  let coperti = ZERO, daConfermare = ZERO, lordo = 0, lordoDaConfermare = 0, reale = 0, stimato = 0, giorniReali = 0, giorniStimati = 0;
  for (const g of giorni) {
    const del = prenotazioni.filter((p) => p.data === g && intero(p.persone) > 0);
    const vero = veri[g];
    if (!del.length && vero === undefined) continue;
    const pr = perGiorno[g] ? prezziPuliti(perGiorno[g], base) : base;
    const righe = del.map((p) => {
      const c = composizione(p);
      return { nome: p.nome || '', servizio: p.servizio, sala: p.sala || '', daConfermare: !!p.daConfermare, ...c, valore: valoreCoperti(c, pr) };
    });
    const cop = righe.reduce((s, r) => somma(s, r), ZERO);
    const copDa = righe.filter((r) => r.daConfermare).reduce((s, r) => somma(s, r), ZERO);
    const valore = cent(righe.reduce((s, r) => s + r.valore, 0));
    const valoreDa = cent(righe.filter((r) => r.daConfermare).reduce((s, r) => s + r.valore, 0));
    const conVero = vero !== undefined;
    const conta = conVero ? vero : valore;
    out.push({
      giorno: g, prenotazioni: righe, coperti: cop, daConfermare: copDa, stima: valore, stimaDaConfermare: valoreDa,
      reale: conVero ? vero : null, conta, prezzi: pr, prezziDelGiorno: !!perGiorno[g],
    });
    coperti = somma(coperti, cop);
    daConfermare = somma(daConfermare, copDa);
    lordo = cent(lordo + conta);
    if (conVero) { reale = cent(reale + vero); giorniReali += 1; } else {
      stimato = cent(stimato + valore); lordoDaConfermare = cent(lordoDaConfermare + valoreDa);
      if (valore > 0) giorniStimati += 1;
    }
  }
  const perc = mercePulita(merce);
  const netto = cent(lordo / (1 + iva / 100));
  const costoMerce = cent(netto * perc / 100);
  return {
    giorni: out, coperti, daConfermare, lordo, lordoDaConfermare, reale, stimato, giorniReali, giorniStimati,
    netto, iva, merce: perc, costoMerce, margine: cent(netto - costoMerce), prezzi: base,
  };
}

/**
 * La percentuale della merce sui mesi prima: merce caricata (IVA esclusa) ÷ incassi senza IVA, sommando i mesi che hanno
 * un incasso. mesi: [{ merce, incassato (IVA inclusa) }] → { percentuale, mesi } oppure null se non c'è niente da cui calcolarla.
 */
export function merceCalcolata(mesi = [], iva = IVA_RISTORAZIONE) {
  const validi = mesi.filter((m) => Number(m.incassato) > 0);
  if (!validi.length) return null;
  const netto = validi.reduce((s, m) => s + Number(m.incassato) / (1 + iva / 100), 0);
  const merce = validi.reduce((s, m) => s + (Number(m.merce) || 0), 0);
  return { percentuale: Math.round(merce / netto * 1000) / 10, mesi: validi.length };
}

/** "9 adulti, 2 bambini, 1 neonato" (solo le voci che ci sono). */
export function copertiScritti(c) {
  const pl = (n, uno, molti) => `${n} ${n === 1 ? uno : molti}`;
  const parti = [pl(c.adulti, 'adulto', 'adulti')];
  if (c.bambini) parti.push(pl(c.bambini, 'bambino', 'bambini'));
  if (c.neonati) parti.push(pl(c.neonati, 'neonato', 'neonati'));
  return parti.join(', ');
}
