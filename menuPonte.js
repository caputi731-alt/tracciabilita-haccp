/**
 * Ponte fra l'app web del Menù (cartella menu/, mostrata in una WebView) e la suite.
 * Qui c'è solo la logica che non dipende dal telefono, così si prova in Node:
 * le azioni vere (file, condivisione, WhatsApp) stanno in menuInvio.js.
 *
 * La pagina manda messaggi JSON { tipo, ... } (vedi menu/js/00-suite.js); alle domande
 * sull'archivio la suite risponde eseguendo nella pagina window.__suiteRisposta(id, ok, valore).
 */

/** Indirizzo della pagina dentro l'APK (i file di menu/ sono copiati negli asset da plugins/conMenu.js). */
export const PAGINA_MENU = 'file:///android_asset/menu/index.html';

/** Nome di file senza caratteri che creano problemi quando lo si salva o lo si passa a un'altra app. */
export const nomeFilePulito = (nome) => {
  const pulito = String(nome || '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').replace(/^[._]+/, '').slice(-120);
  return pulito || 'file';
};

/** Testo → valore JavaScript sicuro dentro uno script (anche con i separatori di riga Unicode). */
const comeLetterale = (valore) => JSON.stringify(valore === undefined ? null : valore)
  .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029').replace(/<\/(script)/gi, '<\\/$1');

/** Script da eseguire nella pagina per consegnare la risposta a una domanda. */
export const scriptRisposta = (id, ok, valore) =>
  `window.__suiteRisposta&&window.__suiteRisposta(${Number(id) || 0},${ok ? 'true' : 'false'},${comeLetterale(valore)});true;`;

/** Script che mostra un avviso con il sistema di avvisi dell'app web. */
export const scriptAvviso = (testo) => `typeof toast==='function'&&toast(${comeLetterale(String(testo))});true;`;

/** Script che comunica alla pagina l'esito del "Salva con nome". */
export const scriptSalvato = (token, ok) =>
  `window.onNativeSaved&&window.onNativeSaved(${comeLetterale(String(token || '').replace(/[^A-Za-z0-9]/g, ''))},${ok ? 'true' : 'false'});true;`;

/** Legge un messaggio arrivato dalla pagina: null se non è uno dei nostri. */
export function leggiMessaggio(testo) {
  try {
    const m = JSON.parse(testo);
    return m && typeof m === 'object' && typeof m.tipo === 'string' ? m : null;
  } catch (e) {
    return null;
  }
}

/**
 * Domande sull'archivio (kvGet, kvKeys, kvSetMany): restituisce lo script di risposta,
 * oppure null se il messaggio non riguarda l'archivio. `archivio` = { leggi, chiavi, scrivi }.
 */
export async function rispondiArchivio(m, archivio) {
  if (!m || !['kvGet', 'kvKeys', 'kvSetMany'].includes(m.tipo)) return null;
  try {
    let valore = null;
    if (m.tipo === 'kvGet') valore = await archivio.leggi(String(m.k));
    else if (m.tipo === 'kvKeys') valore = await archivio.chiavi();
    else await archivio.scrivi(m.pairs);
    return scriptRisposta(m.id, true, valore);
  } catch (e) {
    return scriptRisposta(m.id, false, String((e && e.message) || e));
  }
}

/** Script che consegna alla pagina l'elenco aggiornato delle ricette (dopo che sono state modificate nella suite). */
export const scriptRicette = (elenco) => `window.__suiteRicette&&window.__suiteRicette(${comeLetterale(elenco || [])});true;`;

/**
 * Domande sulle ricette (ricette, creaRicetta): restituisce lo script di risposta, oppure null se il messaggio
 * non le riguarda. `ricette` = { elenco(), crea(nome) }.
 */
export async function rispondiRicette(m, ricette) {
  if (!m || !['ricette', 'creaRicetta'].includes(m.tipo)) return null;
  try {
    const valore = m.tipo === 'ricette' ? await ricette.elenco() : await ricette.crea(String(m.nome || ''));
    return scriptRisposta(m.id, true, valore);
  } catch (e) {
    return scriptRisposta(m.id, false, String((e && e.message) || e));
  }
}

/* Prenotazioni nel calendario del Menù (scelta di Luca del 18/10/2026): la suite manda alla pagina le prenotazioni confermate in
   Sala e quelle di Family Wall da confermare; toccandone una la pagina chiede di aprire la Sala su quel giorno (messaggio apriSala). */

/** Giorni da mandare al calendario: da tre mesi fa a 400 giorni avanti. → [da, a] (AAAA-MM-GG). */
export function finestraCalendario(oggi) {
  const [a, m, g] = String(oggi).split('-').map(Number);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return [iso(new Date(a, m - 1, g - 92, 12)), iso(new Date(a, m - 1, g + 400, 12))];
}

/** Script che consegna alla pagina l'elenco aggiornato delle prenotazioni. */
export const scriptPrenotazioni = (elenco) => `window.__suitePrenotazioni&&window.__suitePrenotazioni(${comeLetterale(elenco || [])});true;`;

/** Domanda "prenotazioni" della pagina: lo script di risposta, oppure null se il messaggio non la riguarda. `elenco()` le legge. */
export async function rispondiPrenotazioni(m, elenco) {
  if (!m || m.tipo !== 'prenotazioni') return null;
  try {
    return scriptRisposta(m.id, true, await elenco());
  } catch (e) {
    return scriptRisposta(m.id, false, String((e && e.message) || e));
  }
}

/** Messaggio apriSala della pagina → { data, servizio } validi (più `uid` se è una prenotazione di Family Wall da confermare:
 *  la Sala apre la sua scheda di conferma), oppure null. */
export function aperturaSala(m) {
  if (!m || m.tipo !== 'apriSala' || !/^\d{4}-\d{2}-\d{2}$/.test(String(m.data || ''))) return null;
  const out = { data: m.data, servizio: m.servizio === 'Cena' ? 'Cena' : 'Pranzo' };
  if (typeof m.uid === 'string' && m.uid) out.uid = m.uid;
  return out;
}

/* Disdette dal calendario del Menù (Fase 3 del controllo UX, 23/10/2026): "Disdici" su ogni prenotazione e "Annulla" nell'avviso. */

/** Messaggio disdiciPrenotazione / annullaDisdetta della pagina → cosa fare, oppure null se non è valido. */
export function azionePrenotazione(m) {
  if (!m) return null;
  if (m.tipo === 'disdiciPrenotazione') {
    if (typeof m.uid === 'string' && m.uid) return { cosa: 'esterna', uid: m.uid };
    const t = m.tavolata;
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(m.data || '')) && typeof t === 'string' && t) {
      return { cosa: 'tavolata', data: m.data, servizio: m.servizio === 'Cena' ? 'Cena' : 'Pranzo', tavolata: t };
    }
    return null;
  }
  if (m.tipo === 'annullaDisdetta' && Number.isInteger(m.disdetta) && m.disdetta > 0) return { cosa: 'annulla', id: m.disdetta };
  return null;
}

/**
 * Risponde a disdiciPrenotazione / annullaDisdetta: `fare` = { tavolata(data, servizio, id), esterna(uid), annulla(id), elenco() }.
 * La pagina riceve { nome, disdetta (id per "Annulla"), sala, elenco (prenotazioni aggiornate) }; null se il messaggio non la riguarda.
 */
export async function rispondiAzionePrenotazione(m, fare) {
  if (!m || (m.tipo !== 'disdiciPrenotazione' && m.tipo !== 'annullaDisdetta')) return null;
  try {
    const a = azionePrenotazione(m);
    if (!a) throw new Error('Prenotazione non trovata');
    const e = a.cosa === 'tavolata' ? await fare.tavolata(a.data, a.servizio, a.tavolata)
      : a.cosa === 'esterna' ? await fare.esterna(a.uid) : await fare.annulla(a.id);
    return scriptRisposta(m.id, true, {
      nome: (e && e.nome) || '', disdetta: (e && a.cosa !== 'annulla' && e.id) || null, sala: (e && e.sala) || null, elenco: await fare.elenco(),
    });
  } catch (e) {
    return scriptRisposta(m.id, false, String((e && e.message) || e));
  }
}

/** Dove va un indirizzo chiesto dalla pagina: 'pagina' (resta nella WebView), 'fuori' (altra app) o 'niente'. */
export function destinazione(url) {
  const u = String(url || '');
  if (u.startsWith('file:///android_asset/menu/') || u === 'about:blank') return 'pagina';
  if (/^(https?|whatsapp|tel|mailto|sms|market|intent):/i.test(u)) return 'fuori';
  return 'niente';
}

/** Numero di telefono per WhatsApp: solo cifre, valido da 8 in su. */
export const numeroWhatsApp = (telefono) => {
  const cifre = String(telefono || '').replace(/[^0-9]/g, '');
  return cifre.length >= 8 ? cifre : '';
};

/** Tipo comune a più file: se sono diversi, uno generico. */
export const tipoComune = (file) => {
  const tipi = [...new Set((file || []).map((f) => f.mime || '*/*'))];
  return tipi.length === 1 ? tipi[0] : '*/*';
};

/**
 * Prossimo menù in calendario (da oggi in poi, esclusi i rifiutati), letto dallo stato salvato dall'app web
 * (chiave 'state' di menu_dati). null se non ce n'è nessuno o se lo stato non si legge.
 */
export function prossimoMenu(testoStato, oggi) {
  try {
    const stato = JSON.parse(testoStato);
    const futuri = (stato.menus || [])
      .filter((m) => m && typeof m.date === 'string' && m.date >= oggi && m.status !== 'rifiutata')
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const m = futuri[0];
    if (!m) return null;
    const modello = (stato.templates || []).find((t) => t && t.id === m.templateId);
    return {
      data: m.date,
      titolo: String(m.heading || '').trim() || (modello && modello.heading) || 'Menù',
      cliente: String(m.client || '').trim(),
      ospiti: (Number(m.guests) || 0) + (Number(m.guestsKids) || 0),
      stato: m.status || 'bozza',
    };
  } catch (e) {
    return null;
  }
}

/**
 * Eventi del Menù letti dallo stato salvato dall'app web, per il resto della suite (allergeni dell'evento, fabbisogno,
 * produzioni): data, cliente, ospiti e, per ogni portata, la ricetta collegata nell'archivio portate (ricettaId, null se
 * non c'è o se in quel menù il testo della portata è stato cambiato) e i prezzi a persona. Ordinati per data; [] se lo stato non si legge.
 */
export function eventiMenu(testoStato) {
  try {
    const stato = JSON.parse(testoStato);
    const portate = new Map((stato.dishes || []).filter(Boolean).map((d) => [d.id, d]));
    const unaRiga = (t) => String(t || '').replace(/\s+/g, ' ').trim();
    const numeri = (a) => [...new Set((Array.isArray(a) ? a : []).map(Number).filter((n) => n >= 1 && n <= 14))].sort((x, y) => x - y);
    const prezzo = (suo, delModello) => {
      const v = suo === undefined || suo === null ? delModello : suo;
      const n = v === undefined || v === null || String(v).trim() === '' ? NaN : Number(String(v).replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    };
    return (stato.menus || []).filter((m) => m && typeof m.date === 'string' && m.date).map((m) => {
      const modello = (stato.templates || []).find((t) => t && t.id === m.templateId);
      const righe = [];
      for (const [sezioni, bambini] of [[m.sections, false], [m.kidsSections, true]]) {
        for (const s of sezioni || []) {
          for (const i of (s && s.items) || []) {
            const d = i.dishId ? portate.get(i.dishId) : null;
            const stessa = !!d && unaRiga(d.name) === unaRiga(i.name);
            // allergeni indicati a mano nel Menù, con le stesse regole dell'app web (algNums/algState in menu/js/03-pagine.js):
            // quelli scritti sulla portata del menù, altrimenti quelli dell'archivio (da verificare se il testo è cambiato)
            const suoi = Array.isArray(i.alg);
            const archivio = !!d && ((Array.isArray(d.alg) && d.alg.length > 0) || d.algSet === true);
            righe.push({
              nome: unaRiga(i.name), sezione: s.name || '', bambini,
              portataId: d ? d.id : null, ricettaId: stessa && d.rid ? d.rid : null,
              allergeniAMano: {
                numeri: numeri(suoi ? i.alg : archivio ? d.alg : []),
                stato: suoi ? 'ok' : !archivio ? 'manca' : stessa ? 'ok' : 'verifica',
              },
            });
          }
        }
      }
      return {
        id: m.id, data: m.date, ora: m.time || '', stato: m.status || 'bozza',
        titolo: String(m.heading || '').trim() || (modello && modello.heading) || 'Menù',
        cliente: String(m.client || '').trim(),
        ospiti: Number(m.guests) || 0, bambini: Number(m.guestsKids) || 0,
        // prezzi a persona (IVA compresa): quelli scritti nel menù, altrimenti quelli predefiniti del template
        prezzoAdulti: prezzo(m.priceAdult, modello && modello.priceAdult),
        prezzoBambini: prezzo(m.priceKid, modello && modello.priceKid),
        portate: righe,
      };
    }).sort((a, b) => (a.data + a.ora < b.data + b.ora ? -1 : a.data + a.ora > b.data + b.ora ? 1 : 0));
  } catch (e) {
    return [];
  }
}
