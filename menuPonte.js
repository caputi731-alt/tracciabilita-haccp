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
