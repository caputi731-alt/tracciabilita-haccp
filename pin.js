/**
 * PIN del titolare su questo telefono. Per ora protegge i backup (vedi protezione.js); la sezione Conti userà lo stesso PIN.
 *
 * Il PIN non viene salvato: nelle preferenze (locali, mai dentro i backup) restano il "sale" e la chiave ricavata dal PIN,
 * che serve per cifrare il backup automatico senza chiedere il PIN ogni giorno. Chi ha in mano il telefono sbloccato
 * vede comunque i dati nell'app: la protezione riguarda le copie che escono dal telefono (cartella, Drive, email).
 */
import { leggiPreferenza, salvaPreferenza } from './database';
import {
  GIRI, CIFRE_PIN, derivaChiave, proteggi, apri, eProtetto, datiChiave, uguali, pinValido, casuali, provaMotore,
} from './protezione';

/** { chiave, sale, giri } del PIN di questo telefono, oppure null se il PIN non è impostato. */
export async function segretoDelTelefono() {
  const sale = await leggiPreferenza('pin_sale');
  const chiave = await leggiPreferenza('pin_chiave');
  if (!sale || !chiave) return null;
  return { sale, chiave, giri: Number(await leggiPreferenza('pin_giri')) || GIRI };
}

export const pinImpostato = async () => !!(await segretoDelTelefono());

async function salvaSegreto({ sale, chiave, giri }) {
  await salvaPreferenza('pin_giri', String(giri));
  await salvaPreferenza('pin_sale', sale);
  await salvaPreferenza('pin_chiave', chiave);
}

/** Imposta (o sostituisce) il PIN. */
export async function impostaPin(pin) {
  if (!pinValido(pin)) throw new Error(`Il PIN deve avere ${CIFRE_PIN} cifre.`);
  await provaMotore();
  const sale = await casuali(16);
  await salvaSegreto({ sale, giri: GIRI, chiave: await derivaChiave(pin, sale, GIRI) });
}

/** Il PIN digitato è quello di questo telefono? */
export async function verificaPin(pin) {
  const s = await segretoDelTelefono();
  if (!s || !pinValido(pin)) return false;
  return uguali(await derivaChiave(pin, s.sale, s.giri), s.chiave);
}

/** Testo da scrivere nel file di backup: cifrato se il PIN è impostato, altrimenti il JSON com'era. */
export async function testoBackup(dump) {
  const json = JSON.stringify(dump);
  const s = await segretoDelTelefono();
  return s ? proteggi(json, s, dump?.generato || null) : json;
}

/**
 * Legge il testo di un file di backup.
 * Restituisce { dump } se si è aperto, oppure { servePin: true, generato } se è protetto con un PIN diverso
 * da quello di questo telefono (o qui il PIN non c'è): in quel caso si richiama passando il PIN digitato.
 * Con il PIN sbagliato lancia un errore con `pinErrato`.
 */
export async function leggiBackup(testo, pin = null) {
  let contenuto;
  try { contenuto = JSON.parse(testo); } catch (e) { throw new Error('Il file scelto non è un backup valido.'); }
  if (!eProtetto(contenuto)) return { dump: contenuto, protetto: false };
  const { sale, giri } = datiChiave(contenuto);
  const mio = await segretoDelTelefono();
  // stesso PIN di questo telefono: la chiave c'è già, non serve digitarlo
  if (mio && mio.giri === giri && mio.sale === sale) {
    return { dump: JSON.parse(await apri(contenuto, mio.chiave)), protetto: true };
  }
  if (pin === null) return { servePin: true, generato: contenuto.generato || null };
  const chiave = await derivaChiave(pin, sale, giri);
  const dump = JSON.parse(await apri(contenuto, chiave));
  // telefono nuovo (o app reinstallata) senza PIN: quello del backup diventa il PIN anche qui
  let adottato = false;
  if (!mio) { await salvaSegreto({ sale, giri, chiave }); adottato = true; }
  return { dump, protetto: true, adottato };
}

/* ---------- costi e margini: visibili solo dopo il PIN del titolare ---------- */

const MINUTI_SBLOCCO = 10;
let costiFinoA = 0;

/** I costi sono stati sbloccati da poco con il PIN? (vale per qualche minuto, poi il PIN va rimesso) */
export const costiSbloccati = () => Date.now() < costiFinoA;

/** Sblocca i costi con il PIN; se è sbagliato lancia un errore con `pinErrato`. */
export async function sbloccaCosti(pin) {
  if (!(await verificaPin(pin))) {
    const e = new Error('PIN non corretto');
    e.pinErrato = true;
    throw e;
  }
  costiFinoA = Date.now() + MINUTI_SBLOCCO * 60000;
}

export const bloccaCosti = () => { costiFinoA = 0; };
