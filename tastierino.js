/**
 * Tastierino delle temperature (proposta A del 20/10/2026, fase 4). Modulo puro (provato in test/tastierino.test.mjs):
 * come cambia il valore scritto a ogni tasto, i pulsanti ±0,5, se il valore è nei limiti e la settimana a pallini del registro.
 * Il componente che lo disegna è TastierinoTemperatura.js.
 */
import { aNumero, numeroPerCampo, piuGiorni, giornoDi } from './utile';

export const MENO = '−'; // segno meno tipografico, come lo mostra il tastierino
const MAX_CIFRE = 4;

/** Testo mostrato per un numero (virgola, segno meno tipografico). '' per null. */
export function testoDi(numero) {
  if (numero === null || numero === undefined || !Number.isFinite(Number(numero))) return '';
  return numeroPerCampo(Math.round(Number(numero) * 10) / 10).replace('-', MENO);
}

/** Numero di un testo del tastierino (accetta anche "-" e "."); null se non è un numero. */
export const numeroDi = (testo) => aNumero(String(testo || '').replace(MENO, '-'));

/**
 * Nuovo testo dopo un tasto: cifre, ',' (una sola, al massimo un decimale), 'segno' (cambia + e −), 'cancella'.
 * `nuovo` = il testo mostrato è ancora quello proposto (di ieri): la prima cifra lo sostituisce invece di aggiungersi.
 */
export function premi(testo, tasto, nuovo = false) {
  let t = nuovo && /^[0-9,]$/.test(tasto) ? '' : String(testo || '');
  const meno = t.startsWith(MENO);
  let corpo = meno ? t.slice(1) : t;
  if (tasto === 'cancella') {
    if (nuovo) return '';
    corpo = corpo.slice(0, -1);
    return corpo ? (meno ? MENO : '') + corpo : '';
  }
  if (tasto === 'segno') return corpo ? (meno ? corpo : MENO + corpo) : (meno ? '' : MENO);
  if (tasto === ',') {
    if (corpo.includes(',')) return t;
    corpo = (corpo || '0') + ',';
  } else if (/^[0-9]$/.test(tasto)) {
    const [intera, decimali] = corpo.split(',');
    if (decimali !== undefined && decimali.length >= 1) return t; // un decimale basta
    if (decimali === undefined && intera.replace(/^0$/, '').length >= MAX_CIFRE - 1) return t;
    corpo = corpo === '0' ? tasto : corpo + tasto;
  } else {
    return t;
  }
  return (meno ? MENO : '') + corpo;
}

/** ±0,5 sul valore scritto (vuoto = parte da 0). */
export function aggiungi(testo, delta) {
  const n = numeroDi(testo);
  return testoDi((n === null ? 0 : n) + delta);
}

/** 'vuoto' | 'ok' | 'fuori' rispetto ai limiti del frigorifero. */
export function statoValore(testo, punto) {
  const n = numeroDi(testo);
  if (n === null) return 'vuoto';
  if (!punto) return 'ok';
  return n < Number(punto.temp_min) || n > Number(punto.temp_max) ? 'fuori' : 'ok';
}

/**
 * Settimana a pallini del registro: per ogni frigorifero gli ultimi `n` giorni fino a `ultimo` (compreso), ciascuno
 * 'ok' (tutte nei limiti), 'fuori' (almeno una fuori limite) o 'manca' (nessuna rilevazione).
 * `righe` = rilevazioni con punto_controllo_id, data_ora, esito.
 */
export function settimanaPunti(punti, righe, ultimo, n = 7) {
  const primo = piuGiorni(ultimo, -(n - 1));
  const giorni = Array.from({ length: n }, (_, i) => piuGiorni(primo, i));
  const per = {};
  for (const r of righe || []) {
    const g = giornoDi(r.data_ora);
    const k = `${r.punto_controllo_id}|${g}`;
    if (r.esito !== 'conforme') per[k] = 'fuori';
    else if (!per[k]) per[k] = 'ok';
  }
  const esito = {};
  for (const p of punti || []) esito[p.id] = giorni.map((g) => ({ giorno: g, stato: per[`${p.id}|${g}`] || 'manca' }));
  return esito;
}
