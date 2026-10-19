/**
 * Prenotazioni da Family Wall (Fase 1, scelte di Luca del 18/10/2026): la suite LEGGE il calendario condiviso tramite il suo link
 * iCal (sola lettura, gratuito) e propone per ogni evento una scheda da confermare in Sale. Modulo puro, provato in
 * test/familywall.test.mjs.
 *
 * Come scrivono le prenotazioni (esempi di Luca, senza un ordine preciso): cognome, coperti, telefono, note.
 * - "9+2+1" = adulti + bambini + neonati; "5-1(8anni)" = 5 adulti e 1 bambino di 8 anni ("-" vale come "+").
 * - "13/16" = da 13 a 16 persone: i tavoli si preparano per il numero più alto.
 * - "A.S." = sala antica stalla, "S.P." = sala panoramica.
 * - Lavorano solo a pranzo, salvo eccezioni: "cena" o "sera" nel testo propongono la cena (da controllare).
 * - Evento verde = acconto ricevuto (se il colore arriva nel link; altrimenti si spunta a mano).
 * - Gli orari degli eventi NON contano.
 * Nulla viene messo a tavola da solo: ogni scheda va confermata, e i campi incerti sono segnalati.
 */
import { giornoDi, oggiLocale, piuGiorni } from './utile';
import { SALE, ID_SALE, lunghezza, postoMigliore, metti, togli, pianoVuoto } from './sale';

/* ---------- lettura del file iCal ---------- */

const togliEscape = (v) => String(v || '')
  .replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');

/** "NOME;PARAM=..:valore" → { nome, param, valore }; i due punti dentro i parametri tra virgolette non contano. */
function rigaIcs(riga) {
  let virgolette = false;
  for (let i = 0; i < riga.length; i++) {
    const c = riga[i];
    if (c === '"') virgolette = !virgolette;
    else if (c === ':' && !virgolette) {
      const testa = riga.slice(0, i);
      const [nome, ...param] = testa.split(';');
      return { nome: nome.toUpperCase(), param: param.join(';').toUpperCase(), valore: riga.slice(i + 1) };
    }
  }
  return null;
}

/** Giorno (AAAA-MM-GG) di un DTSTART: data semplice, ora locale/del fuso, oppure istante UTC ("Z") portato al giorno del telefono. */
export function giornoIcs(valore) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(String(valore || '').trim());
  if (!m) return null;
  const [, a, me, g, h, mi, s, z] = m;
  if (z) return giornoDi(`${a}-${me}-${g}T${h}:${mi}:${s || '00'}Z`);
  return `${a}-${me}-${g}`;
}

/**
 * Eventi del calendario: [{ uid, data, titolo, descrizione, colore }]. Gli eventi annullati (STATUS:CANCELLED) non ci sono.
 * Gli eventi che si ripetono valgono solo per il primo giorno (le prenotazioni non si ripetono).
 */
export function leggiIcs(testo) {
  const righe = String(testo || '').replace(/\r\n[ \t]|\n[ \t]/g, '').split(/\r?\n/);
  const eventi = [];
  let ev = null;
  for (const r of righe) {
    const t = r.trim();
    if (/^BEGIN:VEVENT$/i.test(t)) { ev = {}; continue; }
    if (/^END:VEVENT$/i.test(t)) {
      if (ev && ev.data && !ev.annullato && (ev.titolo || ev.descrizione)) {
        const uid = (ev.uid || `${ev.data}|${ev.titolo}`) + (ev.ricorrenza ? `@${ev.ricorrenza}` : '');
        eventi.push({ uid, data: ev.data, titolo: ev.titolo || '', descrizione: ev.descrizione || '', colore: ev.colore || '' });
      }
      ev = null;
      continue;
    }
    if (!ev) continue;
    const p = rigaIcs(r);
    if (!p) continue;
    if (p.nome === 'UID') ev.uid = p.valore.trim();
    else if (p.nome === 'SUMMARY') ev.titolo = togliEscape(p.valore).trim();
    else if (p.nome === 'DESCRIPTION') ev.descrizione = togliEscape(p.valore).trim();
    else if (p.nome === 'DTSTART') ev.data = giornoIcs(p.valore);
    else if (p.nome === 'RECURRENCE-ID') ev.ricorrenza = giornoIcs(p.valore);
    else if (p.nome === 'STATUS') ev.annullato = /CANCELLED/i.test(p.valore);
    else if (p.nome === 'COLOR' || /COLOR/.test(p.nome)) ev.colore = ev.colore || p.valore.trim();
  }
  return eventi;
}

/** Il colore dell'evento è verde? (= acconto ricevuto, scelta di Luca). Accetta nomi ("green", "forestgreen") ed esadecimali. */
export function eVerde(colore) {
  const c = String(colore || '').trim().toLowerCase();
  if (!c) return false;
  if (/green|verde/.test(c)) return true;
  const m = /^#?([0-9a-f]{6})(?:[0-9a-f]{2})?$/.exec(c);
  if (!m) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  return g >= 90 && g > r + 30 && g > b + 15;
}

/* ---------- lettura del testo di una prenotazione ---------- */

/** Toglie dal testo l'intervallo [da, a) lasciando spazi al suo posto: le posizioni del resto non cambiano. */
const sbianca = (s, da, a) => s.slice(0, da) + ' '.repeat(a - da) + s.slice(a);
const cifre = (s) => String(s).replace(/\D/g, '');
const primaCifra = (s, i) => i > 0 && /[\d+]/.test(s[i - 1]);

/** Il primo numero di telefono del testo: { tel, da, a } oppure null. Cellulari, fissi e numeri esteri con il "+". */
export function trovaTelefono(s) {
  const modi = [
    { re: /\+\d{1,3}[ .]?\d[\d .]{5,13}\d(?!\d)/g, min: 8, max: 15 }, // estero: +41 78 819 34 84
    { re: /3\d{2}[ .]?\d{3}[ .]?\d{3,4}(?!\d)/g, min: 9, max: 10 },   // cellulare: 347 123 4567
    { re: /0\d{1,3}[ .]?\d{5,8}(?!\d)/g, min: 6, max: 11 },           // fisso: 080 1234567
  ];
  let migliore = null;
  for (const { re, min, max } of modi) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(s))) {
      const n = cifre(m[0]).length;
      if (primaCifra(s, m.index) || n < min || n > max) continue;
      if (!migliore || m.index < migliore.da) migliore = { tel: (m[0].trim().startsWith('+') ? '+' : '') + cifre(m[0]), da: m.index, a: m.index + m[0].length };
      break;
    }
  }
  return migliore;
}

// lettere (anche accentate) scritte per esteso: nelle espressioni del motore JavaScript del telefono non si usa \p{L}
const L = 'A-Za-zÀ-ÖØ-öø-ÿ';
const SIGLE_SALA = [
  { re: new RegExp(`(^|[^${L}\\d])(a\\s?\\.?\\s?s\\.?)(?![${L}\\d])`, 'i'), sala: 'stalla' },
  { re: new RegExp(`(^|[^${L}\\d])(s\\s?\\.?\\s?p\\.?)(?![${L}\\d])`, 'i'), sala: 'panoramica' },
];
const PAROLE_INUTILI = new RegExp(`(^|[^${L}])(cop(?:erti)?|pax|pers(?:one)?|cell?|cellulare|tel(?:efono)?|nr?|num)\\.?(?![${L}])`, 'gi');
const SERA = new RegExp(`(^|[^${L}])(cena|sera)(?![${L}])`, 'i');
const ACCONTO = new RegExp(`(^|[^${L}])acc(?:onto)?\\.?(?![${L}])`, 'i');

/** Coperti nel testo: intervallo "13/16", composizione "9+2+1" / "5-1(8anni)", oppure un numero da solo. */
function trovaCoperti(s) {
  // da A a B persone
  const intervallo = /(\d{1,3})\s*\/\s*(\d{1,3})(?![\d/])/g;
  let m;
  while ((m = intervallo.exec(s))) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (!primaCifra(s, m.index) && a > 0 && b > a && b <= 300) {
      return { adulti: b, bambini: 0, neonati: 0, min: a, max: b, eta: [], da: m.index, a: m.index + m[0].length, dubbio: false };
    }
  }
  // adulti + bambini (+ neonati); fra parentesi, attaccata al numero, l'età dei bambini
  const composizione = /(\d{1,3})((?:\s*[+-]\s*\d{1,2}(?:\(\s*\d{1,2}[^)]*\))?)+)/g;
  while ((m = composizione.exec(s))) {
    if (primaCifra(s, m.index)) continue;
    const parti = [Number(m[1])];
    const eta = [];
    const resto = /[+-]\s*(\d{1,2})(?:\(\s*([^)]*)\))?/g;
    let q;
    while ((q = resto.exec(m[2]))) {
      parti.push(Number(q[1]));
      if (q[2]) eta.push(q[2].replace(/(\d)\s*(anni|anno|mesi|mese)/i, '$1 $2').trim());
    }
    const [adulti, bambini = 0, neonati = 0, ...oltre] = parti;
    const extra = oltre.reduce((x, y) => x + y, 0);
    const tot = adulti + bambini + neonati + extra;
    return { adulti, bambini: bambini + extra, neonati, min: tot, max: tot, eta, da: m.index, a: m.index + m[0].length, dubbio: oltre.length > 0 };
  }
  // un numero da solo: meglio se seguito da "cop", "pax", "persone"; non quelli attaccati a una parentesi o a una parola ("8anni")
  const singolo = /(\d{1,3})(?![\d(])(\s*(?:cop(?:erti)?|pax|pers(?:one)?)\b)?/gi;
  const trovati = [];
  while ((m = singolo.exec(s))) {
    if (primaCifra(s, m.index)) continue;
    const dopo = s.slice(m.index + m[1].length);
    if (/^\s*\(/.test(dopo) || new RegExp(`^[${L}]`).test(dopo.replace(/^(cop|pax|pers)/i, ''))) {
      if (!m[2]) continue;
    }
    // gli importi non sono persone: "acc 100", "€ 50", "50 euro"
    if (/(acc(?:onto)?\.?|€|euro)\s*$/i.test(s.slice(0, m.index)) || /^\s*(€|euro)/i.test(dopo)) continue;
    const n = Number(m[1]);
    if (n > 0 && n <= 300) trovati.push({ n, da: m.index, a: m.index + m[1].length, conParola: !!m[2] });
  }
  if (!trovati.length) return null;
  const scelto = trovati.find((t) => t.conParola) || trovati[0];
  return { adulti: scelto.n, bambini: 0, neonati: 0, min: scelto.n, max: scelto.n, eta: [], da: scelto.da, a: scelto.a, dubbio: trovati.length > 1 && !scelto.conParola };
}

const pulisci = (s) => String(s || '')
  .replace(/\(\s*\)/g, ' ')
  .replace(/\(\s+/g, '(').replace(/\s+\)/g, ')')
  .replace(/(\d)\(/g, '$1 (')
  .replace(/\s+/g, ' ')
  .replace(/^[\s,.;:/+\-–]+|[\s,;:/+\-–]+$/g, '')
  .trim();

/**
 * Scheda proposta da un evento: { nome, adulti, bambini, neonati, min, max, persone, eta, telefono, sala, servizio, acconto,
 * note, incerti: ['nome' | 'persone' | 'servizio'], prenotazione }. `persone` è il numero per i tavoli (il più alto
 * dell'intervallo); `prenotazione` è false quando nel testo non c'è nessun numero di persone (compleanni, promemoria…).
 */
export function leggiTesto(titolo, descrizione = '', colore = '') {
  let s = ` ${String(titolo || '').replace(/\s+/g, ' ')} `;
  let d = String(descrizione || '').trim();
  const incerti = [];

  // telefono: nel titolo, altrimenti nella descrizione
  let telefono = '';
  const tel = trovaTelefono(s);
  if (tel) { telefono = tel.tel; s = sbianca(s, tel.da, tel.a); } else {
    const t2 = trovaTelefono(d);
    if (t2) { telefono = t2.tel; d = d.slice(0, t2.da) + d.slice(t2.a); }
  }

  // sala dalla sigla
  let sala = null;
  for (const { re, sala: id } of SIGLE_SALA) {
    const m = re.exec(s);
    if (m && !sala) { sala = id; const da = m.index + m[1].length; s = sbianca(s, da, da + m[2].length); }
  }

  // servizio: solo a pranzo, salvo "cena" / "sera"
  let servizio = 'Pranzo';
  const sera = SERA.exec(s) || SERA.exec(d);
  if (sera) { servizio = 'Cena'; incerti.push('servizio'); }

  const acconto = eVerde(colore) || ACCONTO.test(s) || ACCONTO.test(d);

  // coperti: nel titolo, altrimenti nella descrizione
  let c = trovaCoperti(s);
  let nome = '';
  let resto = '';
  if (c) {
    nome = s.slice(0, c.da);
    resto = s.slice(c.a);
  } else {
    const c2 = trovaCoperti(d);
    if (c2) { c = c2; d = d.slice(0, c2.da) + d.slice(c2.a); }
    nome = s;
  }
  nome = pulisci(nome.replace(PAROLE_INUTILI, '$1 '));
  resto = resto.replace(PAROLE_INUTILI, '$1 ');
  if (sera) resto = resto.replace(SERA, '$1 ');
  // senza nome prima dei numeri, il nome sono le prime parole dopo
  if (!nome && resto.trim()) {
    const m = new RegExp(`^\\s*([${L}'’.]+(?:\\s+[${L}'’.]+){0,2})`).exec(resto);
    if (m) { nome = pulisci(m[1]); resto = resto.slice(m.index + m[0].length); }
  }
  if (sera) nome = pulisci(nome.replace(SERA, '$1 '));
  if (!nome || nome.split(' ').length > 4) incerti.push('nome');
  if (!c || c.dubbio) incerti.push('persone');

  const note = [pulisci(resto), pulisci(d.replace(PAROLE_INUTILI, '$1 '))].filter(Boolean).join(' · ');
  return {
    nome,
    adulti: c ? c.adulti : null,
    bambini: c ? c.bambini : 0,
    neonati: c ? c.neonati : 0,
    min: c ? c.min : null,
    max: c ? c.max : null,
    persone: c ? c.max : null,
    eta: c ? c.eta : [],
    telefono,
    sala,
    servizio,
    acconto,
    note,
    incerti,
    prenotazione: !!c,
  };
}

const pl = (n, uno, molti) => `${n} ${n === 1 ? uno : molti}`;

/** Le note della tavolata: composizione del gruppo, acconto, telefono e note del testo, in una riga. */
export function noteTavolata({ adulti, bambini = 0, neonati = 0, min = null, max = null, eta = [], telefono = '', acconto = false, note = '' }) {
  const parti = [];
  if (min && max && max > min) parti.push(`da ${min} a ${max} persone`);
  else if (bambini || neonati) {
    const gruppo = [pl(adulti || 0, 'adulto', 'adulti')];
    if (bambini) gruppo.push(pl(bambini, 'bambino', 'bambini') + (eta.length ? ` (${eta.join(', ')})` : ''));
    if (neonati) gruppo.push(pl(neonati, 'neonato', 'neonati'));
    parti.push(gruppo.join(', '));
  }
  if (acconto) parti.push('Acconto ricevuto');
  if (telefono) parti.push(`Tel ${telefono}`);
  if (note) parti.push(note);
  return parti.join(' · ');
}

/* ---------- confronto con quello che la suite ha già ---------- */

export const FINESTRA_GIORNI = 400; // quanto avanti si guarda nel calendario
export const GIORNI_INDIETRO = 92; // quanto indietro (come il calendario del Menù, `finestraCalendario` in menuPonte.js)
const firma = (x) => `${x.data}|${x.testo}|${x.colore || ''}`;
export const testoEvento = (e) => [e.titolo, e.descrizione].filter(Boolean).join('\n');

/**
 * Cosa cambiare nelle prenotazioni salvate (righe della tabella `prenotazioni_esterne`) dopo aver letto il calendario.
 * Nulla di confermato viene cancellato da solo, e (scelta di Luca del 19/10/2026) nulla dei giorni passati: le prenotazioni
 * passate restano anche se non sono state confermate, così il calendario del Menù le mostra ancora.
 * Da oggi in poi:
 * - evento nuovo → riga 'nuova' (da confermare);
 * - evento cambiato: se era da confermare si aggiorna; se era scartato torna da confermare; se era confermato si aggiorna
 *   e viene segnalato (`cambiata`), la tavolata resta dov'è;
 * - evento sparito: se era da confermare o scartato la riga si toglie; se era confermato viene segnalato (`sparita`).
 * Giorni passati (fino a `GIORNI_INDIETRO`): un evento che manca si aggiunge (così tornano anche quelle cancellate prima di
 * questa scelta) e uno cambiato si aggiorna se non era confermato; nessuna segnalazione e nessuna cancellazione.
 * → { inserisci: [riga], aggiorna: [{ uid, ...campi }], elimina: [uid] }
 */
export function confronta(righe, eventi, oggi = oggiLocale()) {
  const inizio = piuGiorni(oggi, -GIORNI_INDIETRO);
  const fine = piuGiorni(oggi, FINESTRA_GIORNI);
  const salvate = new Map(righe.map((r) => [r.uid, r]));
  const visti = new Set();
  const out = { inserisci: [], aggiorna: [], elimina: [] };

  for (const e of eventi) {
    if (!e.data || e.data < inizio || e.data > fine || visti.has(e.uid)) continue;
    visti.add(e.uid);
    const passato = e.data < oggi;
    const nuovo = { data: e.data, testo: testoEvento(e), colore: e.colore || '' };
    const r = salvate.get(e.uid);
    if (!r) { out.inserisci.push({ uid: e.uid, ...nuovo, stato: 'nuova' }); continue; }
    const cambiato = firma(r) !== firma(nuovo);
    if (r.stato === 'confermata') {
      if (passato) continue;
      if (cambiato) out.aggiorna.push({ uid: r.uid, ...nuovo, cambiata: 1, sparita: 0 });
      else if (r.sparita) out.aggiorna.push({ uid: r.uid, sparita: 0 });
    } else if (cambiato) {
      out.aggiorna.push({ uid: r.uid, ...nuovo, stato: r.stato === 'scartata' && passato ? 'scartata' : 'nuova' });
    }
  }

  for (const r of righe) {
    if (visti.has(r.uid) || r.data < oggi) continue;
    if (r.stato === 'confermata') {
      if (!r.sparita) out.aggiorna.push({ uid: r.uid, sparita: 1 });
    } else {
      out.elimina.push(r.uid);
    }
  }
  return out;
}

/* ---------- messa a tavola ---------- */

/**
 * Mette la tavolata nel posto migliore: nella sala indicata o, se lì non entra, nell'altra.
 * `piani` = { stalla: piano, panoramica: piano } (o null per un giorno ancora vuoto).
 * → { piani, sala, f } oppure null se non c'è posto da nessuna parte.
 */
export function mettiATavola(piani, salaScelta, tavolata) {
  const tutti = Object.fromEntries(ID_SALE.map((id) => [id, (piani && piani[id]) || pianoVuoto(SALE[id])]));
  const len = lunghezza(tavolata);
  const ordine = [salaScelta, ...ID_SALE.filter((id) => id !== salaScelta)].filter((id) => SALE[id]);
  for (const id of ordine) {
    const q = postoMigliore(SALE[id], tutti[id], len);
    if (!q) continue;
    const nuovo = metti(SALE[id], tutti[id], q.f, tavolata, q.p + len / 2);
    if (nuovo) return { piani: { ...tutti, [id]: nuovo }, sala: id, f: q.f };
  }
  return null;
}

/** Toglie una tavolata (per id) da qualunque sala la contenga. */
export function togliTavolata(piani, id) {
  if (!piani) return piani;
  return Object.fromEntries(ID_SALE.map((s) => [s, piani[s] ? togli(SALE[s], piani[s], id) : pianoVuoto(SALE[s])]));
}

/* ---------- link e scaricamento ---------- */

/** Il link incollato: webcal:// diventa https://; accetta solo indirizzi web. → link pulito oppure null. */
export function linkValido(testo) {
  const t = String(testo || '').trim().replace(/^webcals?:\/\//i, 'https://');
  if (!/^https?:\/\/[^\s/]+\.[^\s/]+\/?\S*$/i.test(t)) return null;
  return t.replace(/^http:\/\//i, 'https://');
}

/** Scarica il calendario; dopo `secondi` senza risposta rinuncia (in cucina la rete va e viene). `fetchFn` serve ai test. */
export async function scaricaCalendario(link, { fetchFn = globalThis.fetch, secondi = 20 } = {}) {
  const url = linkValido(link);
  if (!url) throw new Error('Il link del calendario non è valido');
  const Ferma = globalThis.AbortController;
  const ctrl = Ferma ? new Ferma() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), secondi * 1000) : null;
  try {
    let r;
    try {
      r = await fetchFn(url, { signal: ctrl ? ctrl.signal : undefined, headers: { Accept: 'text/calendar' } });
    } catch (e) {
      throw new Error('Nessuna connessione: restano le prenotazioni scaricate l\'ultima volta');
    }
    if (!r || !r.ok) throw new Error(r && (r.status === 404 || r.status === 403 || r.status === 410)
      ? 'Family Wall non riconosce più il link: generane uno nuovo dal calendario e incollalo qui'
      : `Family Wall non ha risposto (errore ${r ? r.status : '?'})`);
    const testo = await r.text();
    if (!/BEGIN:VCALENDAR/i.test(testo)) throw new Error('Il link non porta a un calendario');
    return testo;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* ---------- prenotazioni per il calendario del Menù ---------- */

const NOME_SALA = (id) => (SALE[id] ? SALE[id].nome.replace('Sala ', '').replace(/^./, (c) => c.toUpperCase()) : '');
const ORDINE_SERVIZIO = { Pranzo: 0, Cena: 1 };

/**
 * Le prenotazioni da mostrare nel calendario del Menù (scelta di Luca del 18/10/2026: tutte, confermate e da confermare).
 * - `giorni`: disposizioni salvate in Sala [{ data, servizio, piani }]: ogni tavolata con un nome o delle persone è confermata
 *   (comprese quelle aggiunte a mano in Sala);
 * - `esterne`: righe di `prenotazioni_esterne` ancora da confermare (stato 'nuova'): quelle senza numero di persone non compaiono.
 * → [{ data, servizio, nome, persone, min, max, sala (nome per esteso o ''), daConfermare }], in ordine di giorno e servizio.
 */
export function prenotazioniCalendario(giorni = [], esterne = []) {
  const out = [];
  for (const g of giorni) {
    for (const id of ID_SALE) {
      const piano = g.piani && g.piani[id];
      if (!piano || !Array.isArray(piano.file)) continue;
      for (const fila of piano.file) {
        for (const t of fila || []) {
          const persone = Math.max(0, parseInt(t && t.persone, 10) || 0);
          if (!t || (!String(t.nome || '').trim() && !persone)) continue;
          out.push({ data: g.data, servizio: g.servizio, nome: String(t.nome || '').trim(), persone, min: persone, max: persone, sala: NOME_SALA(id), daConfermare: false });
        }
      }
    }
  }
  for (const r of esterne) {
    if (r.stato !== 'nuova') continue;
    const [titolo, ...desc] = String(r.testo || '').split('\n');
    const s = leggiTesto(titolo, desc.join('\n'), r.colore);
    if (!s.prenotazione) continue;
    out.push({ data: r.data, servizio: s.servizio, nome: s.nome, persone: s.persone, min: s.min, max: s.max, sala: NOME_SALA(s.sala), daConfermare: true });
  }
  return out.sort((a, b) => a.data.localeCompare(b.data) || (ORDINE_SERVIZIO[a.servizio] ?? 2) - (ORDINE_SERVIZIO[b.servizio] ?? 2)
    || Number(a.daConfermare) - Number(b.daConfermare) || a.nome.localeCompare(b.nome, 'it'));
}
