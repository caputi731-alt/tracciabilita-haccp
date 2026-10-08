/**
 * Protezione dei backup con il PIN del titolare: qui il calcolo, in pin.js il PIN salvato sul telefono.
 *
 * I calcoli pesanti li fa Android (modulo nativo react-native-aes-crypto): in JavaScript, sul telefono, ricavare la
 * chiave dal PIN richiederebbe decine di secondi. Tutto viaggia come testo: esadecimale per chiavi e firme, base64 per i dati.
 *  - dal PIN si ricava una chiave con PBKDF2-SHA256 (lento apposta, GIRI ripetizioni);
 *  - il backup è cifrato con AES-256-CBC e firmato con HMAC-SHA256: senza il PIN giusto il file non si apre,
 *    e se qualcuno lo modifica l'apertura fallisce invece di caricare dati alterati.
 *
 * Un PIN di 6 cifre ha un milione di combinazioni: ferma chi trova il file per caso, non chi ha tempo e
 * strumenti per provarle tutte. Il numero di giri è scritto nel file, così in futuro si può alzare.
 * In Node (test/protezione.test.mjs) il modulo nativo è sostituito da test/aes-finto.mjs, che fa gli stessi calcoli.
 */
import Aes from 'react-native-aes-crypto';

export const CIFRE_PIN = 6;
export const GIRI = 300000;
export const FORMATO = 'tenuta-coppa-backup-protetto-1';
const ALGORITMO = 'aes-256-cbc';

export const pinValido = (pin) => new RegExp(`^[0-9]{${CIFRE_PIN}}$`).test(String(pin ?? ''));

function motore() {
  if (!Aes || typeof Aes.pbkdf2 !== 'function') throw new Error('La protezione con PIN non è disponibile in questa versione dell\'app.');
  return Aes;
}

const esadecimale = (testo, caratteri) => typeof testo === 'string' && testo.length === caratteri && /^[0-9a-f]+$/.test(testo);

/** Due testi uguali? Il confronto dura lo stesso tempo qualunque sia il punto in cui differiscono. */
export function uguali(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diversi = 0;
  for (let i = 0; i < a.length; i++) diversi |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diversi === 0;
}

/** Numeri casuali presi da Android: `byte` byte in esadecimale. */
export const casuali = (byte) => motore().randomKey(byte);

/**
 * Chiave (64 caratteri esadecimali) ricavata dal PIN. `sale` è il testo casuale scelto quando si imposta il PIN.
 * Sul telefono richiede circa un secondo.
 */
export async function derivaChiave(pin, sale, giri = GIRI) {
  if (!pinValido(pin)) throw new Error(`Il PIN deve avere ${CIFRE_PIN} cifre.`);
  return derivaDaCodice(pin, sale, giri);
}

/** Come derivaChiave, per un codice di sole cifre di lunghezza qualsiasi (il PUK). */
export async function derivaDaCodice(pin, sale, giri = GIRI) {
  if (!/^[0-9]{4,20}$/.test(String(pin ?? ''))) throw new Error('Codice non valido.');
  if (!esadecimale(sale, 32)) throw new Error('File di backup non valido.');
  const n = Number(giri);
  if (!Number.isInteger(n) || n < 10000 || n > 5000000) throw new Error('File di backup non valido.');
  const chiave = await motore().pbkdf2(String(pin), sale, n, 256, 'sha256');
  if (!esadecimale(chiave, 64)) throw new Error('Calcolo della chiave non riuscito.');
  return chiave;
}

/** Prova con un risultato noto che il telefono calcoli le chiavi come previsto (si fa quando si imposta il PIN). */
export async function provaMotore() {
  const k = await motore().pbkdf2('password', 'salt', 1, 256, 'sha256');
  if (k !== '120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b') {
    throw new Error('Su questo telefono la protezione con PIN non funziona come previsto: il PIN non è stato impostato.');
  }
}

/** Dalla chiave del PIN, due chiavi distinte: una per cifrare e una per firmare. */
async function chiavi(chiave) {
  if (!esadecimale(chiave, 64)) throw new Error('Chiave del PIN non valida.');
  return { cifra: await motore().hmac256('tenuta-coppa/cifra', chiave), firma: await motore().hmac256('tenuta-coppa/firma', chiave) };
}

/** Quello che viene firmato: intestazione e contenuto insieme, così nessuna parte del file si può cambiare. */
const daFirmare = (b) => [b.formato, b.giri, b.sale, b.iv, b.generato || '', b.dati].join('|');

/** I caratteri non semplici (accenti, simboli, faccine) diventano \uXXXX: il JSON resta lo stesso, ma è fatto solo di
 *  caratteri che passano identici da JavaScript ad Android e ritorno. */
const soloSemplici = (testo) => testo.replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

/**
 * JSON del backup → testo del file protetto (JSON con intestazione leggibile e contenuto cifrato).
 * `segreto` = { chiave, sale, giri }. Prima di restituirlo il file viene riaperto e confrontato:
 * un backup che non si riesce a rileggere non viene mai scritto.
 */
export async function proteggi(json, segreto, generato = null) {
  const testo = soloSemplici(json);
  const k = await chiavi(segreto.chiave);
  const busta = { formato: FORMATO, protetto: true, giri: segreto.giri, sale: segreto.sale, iv: await casuali(16), generato };
  busta.dati = await motore().encrypt(testo, k.cifra, busta.iv, ALGORITMO);
  if (typeof busta.dati !== 'string' || !busta.dati) throw new Error('Cifratura del backup non riuscita.');
  busta.firma = await motore().hmac256(daFirmare(busta), k.firma);
  if ((await apri(busta, segreto.chiave)) !== testo) throw new Error('Controllo del backup protetto non superato: il file non è stato scritto.');
  return JSON.stringify(busta);
}

/** Il contenuto letto da un file è un backup protetto da PIN? */
export const eProtetto = (oggetto) => !!oggetto && oggetto.protetto === true && typeof oggetto.dati === 'string';

/** Controlla la busta e ne restituisce i dati per ricavare la chiave: { sale, giri }. */
export function datiChiave(busta) {
  if (!eProtetto(busta) || busta.formato !== FORMATO) {
    throw new Error('Questo backup protetto è di una versione che l\'app non conosce: aggiorna l\'app e riprova.');
  }
  return { sale: busta.sale, giri: busta.giri };
}

/** File protetto + chiave → JSON del backup. Con la chiave sbagliata (o il file modificato) lancia un errore con `pinErrato`. */
export async function apri(busta, chiave) {
  datiChiave(busta);
  const k = await chiavi(chiave);
  if (!uguali(await motore().hmac256(daFirmare(busta), k.firma), String(busta.firma || ''))) {
    const err = new Error('PIN non corretto (oppure il file è rovinato).');
    err.pinErrato = true;
    throw err;
  }
  const testo = await motore().decrypt(busta.dati, k.cifra, busta.iv, ALGORITMO);
  if (typeof testo !== 'string') throw new Error('Apertura del backup non riuscita.');
  return testo;
}
