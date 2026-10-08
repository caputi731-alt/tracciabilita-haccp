/**
 * Backup automatico giornaliero in una cartella scelta dall'utente (Storage Access Framework).
 * La cartella è fuori dall'app: il backup sopravvive anche alla disinstallazione.
 * Copie a rotazione: resta un file per ognuno degli ultimi GIORNI_COPIE giorni (vedi backupDaEliminare in utile.js). Se il PIN è impostato (pin.js) il file dei dati è cifrato; le foto no.
 */
import * as FileSystem from 'expo-file-system';
import {
  esportaTutto, leggiPreferenza, salvaPreferenza, fotoDeiLotti, aggiornaIndirizzoFoto,
} from './database';
import {
  CARTELLA_FOTO, nomeFoto, esisteFoto, rendiPermanente, elencoFotoPermanenti, eliminaFotoOrfane,
} from './foto';
import { testoBackup } from './pin';
import { backupDaEliminare } from './utile';

const SAF = FileSystem.StorageAccessFramework;
export const GIORNI_COPIE = 3;
const ORE_TRA_BACKUP = 20;
const PREFISSO = 'backup-haccp-';

const timbro = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};

export const nomeDaUri = (uri) => {
  if (!uri) return '';
  const dec = decodeURIComponent(uri);
  return dec.split('/').pop().split(':').pop() || dec;
};

export async function statoBackup() {
  const cartella = await leggiPreferenza('backup_cartella');
  const ultimo = await leggiPreferenza('backup_ultimo');
  const errore = await leggiPreferenza('backup_errore');
  const giorni = ultimo ? Math.floor((Date.now() - new Date(ultimo).getTime()) / 86400000) : null;
  return { cartella, nomeCartella: nomeDaUri(cartella), ultimo, giorni, errore };
}

/** Chiede all'utente la cartella dei backup. Restituisce true se scelta. */
export async function scegliCartellaBackup() {
  const perm = await SAF.requestDirectoryPermissionsAsync();
  if (!perm.granted) return false;
  await salvaPreferenza('backup_cartella', perm.directoryUri);
  await salvaPreferenza('backup_errore', null);
  return true;
}

/** Scrive subito un backup nella cartella scelta ed elimina le copie più vecchie. */
export async function eseguiBackup() {
  const cartella = await leggiPreferenza('backup_cartella');
  if (!cartella) throw new Error('Scegli prima la cartella dei backup.');
  try {
    const contenuto = await testoBackup(await esportaTutto());
    const uri = await SAF.createFileAsync(cartella, `${PREFISSO}${timbro()}`, 'application/json');
    await FileSystem.writeAsStringAsync(uri, contenuto, { encoding: FileSystem.EncodingType.UTF8 });

    // rotazione: il file appena scritto prende il posto di quello più vecchio
    const file = (await SAF.readDirectoryAsync(cartella)).filter((u) => nomeDaUri(u).startsWith(PREFISSO));
    const perNome = {};
    file.forEach((u) => { perNome[nomeDaUri(u)] = u; });
    const via = backupDaEliminare(Object.keys(perNome), GIORNI_COPIE, PREFISSO);
    for (const nome of via) {
      try { await FileSystem.deleteAsync(perNome[nome], { idempotent: true }); } catch (e) { /* non bloccante */ }
    }
    const fotoCopiate = await copiaFotoNellaCartella(cartella);
    await salvaPreferenza('backup_ultimo', new Date().toISOString());
    await salvaPreferenza('backup_errore', null);
    return { nome: nomeDaUri(uri), copie: file.length - via.length, byte: contenuto.length, fotoCopiate };
  } catch (e) {
    await salvaPreferenza('backup_errore', String(e?.message || e));
    throw e;
  }
}

/** Da chiamare all'avvio e quando l'app torna in primo piano: esegue il backup se è passato un giorno. */
export async function backupAutomaticoSeServe() {
  try {
    const cartella = await leggiPreferenza('backup_cartella');
    if (!cartella) return null;
    const ultimo = await leggiPreferenza('backup_ultimo');
    if (ultimo && Date.now() - new Date(ultimo).getTime() < ORE_TRA_BACKUP * 3600000) return null;
    return await eseguiBackup();
  } catch (e) {
    return null; // l'errore resta salvato e compare in Home e nella schermata Backup
  }
}

/* ---------- foto ---------- */

async function sottocartellaFoto(cartella, crea) {
  const voci = await SAF.readDirectoryAsync(cartella);
  const esistente = voci.find((u) => nomeDaUri(u) === 'foto');
  if (esistente || !crea) return esistente || null;
  return SAF.makeDirectoryAsync(cartella, 'foto');
}

/** Copia nella cartella dei backup le foto non ancora presenti (le foto non cambiano mai: basta il nome). */
async function copiaFotoNellaCartella(cartella) {
  const locali = await elencoFotoPermanenti();
  if (locali.length === 0) return 0;
  const dir = await sottocartellaFoto(cartella, true);
  const presenti = new Set((await SAF.readDirectoryAsync(dir)).map(nomeDaUri));
  let copiate = 0;
  for (const nome of locali) {
    if (presenti.has(nome)) continue;
    const dati = await FileSystem.readAsStringAsync(`${CARTELLA_FOTO}${nome}`, { encoding: FileSystem.EncodingType.Base64 });
    const dest = await SAF.createFileAsync(dir, nome.replace(/\.jpg$/i, ''), 'image/jpeg');
    await FileSystem.writeAsStringAsync(dest, dati, { encoding: FileSystem.EncodingType.Base64 });
    copiate++;
  }
  return copiate;
}

/**
 * Sposta nella memoria permanente le foto salvate dalle versioni precedenti nella cache.
 * Da chiamare all'avvio: non fa nulla se sono già tutte al sicuro.
 */
export async function mettiAlSicuroFoto() {
  try {
    for (const f of await fotoDeiLotti()) {
      if (String(f.uri).startsWith(CARTELLA_FOTO) || !(await esisteFoto(f.uri))) continue;
      const nuovo = await rendiPermanente(f.uri, f.campo === 'foto_ddt' ? 'documento' : 'etichetta');
      await aggiornaIndirizzoFoto(f.uri, nuovo);
    }
  } catch (e) { /* non bloccante */ }
}

/** Libera spazio: elimina le foto non più collegate a lotti, prodotti o alla fattura lasciata in bozza. */
export async function pulisciFotoInutili() {
  try {
    const usate = new Set((await fotoDeiLotti()).map((f) => nomeFoto(f.uri)));
    const bozza = (await leggiPreferenza('bozza_fattura')) || '';
    (bozza.match(/[A-Za-z0-9_-]+\.jpg/g) || []).forEach((n) => usate.add(n));
    return await eliminaFotoOrfane(usate);
  } catch (e) { return 0; }
}

/** File con i dati di prima dell'ultimo ripristino: permette di tornare indietro se si è scelto il backup sbagliato. */
export const FILE_PRIMA_DEL_RIPRISTINO = `${FileSystem.documentDirectory}prima-del-ripristino.json`;

export async function salvaCopiaDiSicurezza() {
  await FileSystem.writeAsStringAsync(FILE_PRIMA_DEL_RIPRISTINO, JSON.stringify(await esportaTutto()),
    { encoding: FileSystem.EncodingType.UTF8 });
}

export async function copiaDiSicurezza() {
  try {
    const info = await FileSystem.getInfoAsync(FILE_PRIMA_DEL_RIPRISTINO);
    return info.exists ? { quando: info.modificationTime ? new Date(info.modificationTime * 1000) : null } : null;
  } catch (e) { return null; }
}

export async function leggiCopiaDiSicurezza() {
  return JSON.parse(await FileSystem.readAsStringAsync(FILE_PRIMA_DEL_RIPRISTINO));
}

/** Dopo un ripristino o una reinstallazione: recupera dalla cartella dei backup le foto mancanti. */
export async function recuperaFotoMancanti() {
  const cartella = await leggiPreferenza('backup_cartella');
  if (!cartella) return { recuperate: 0, mancanti: 0 };
  const mancanti = [];
  for (const f of await fotoDeiLotti()) {
    if (!(await esisteFoto(f.uri))) mancanti.push(f.uri);
  }
  if (mancanti.length === 0) return { recuperate: 0, mancanti: 0 };
  const dir = await sottocartellaFoto(cartella, false);
  if (!dir) return { recuperate: 0, mancanti: mancanti.length };
  const inCartella = {};
  (await SAF.readDirectoryAsync(dir)).forEach((u) => { inCartella[nomeDaUri(u)] = u; });
  let recuperate = 0;
  const giaFatte = new Set();
  for (const uri of mancanti) {
    if (giaFatte.has(uri)) continue;
    giaFatte.add(uri);
    const sorgente = inCartella[nomeFoto(uri)];
    if (!sorgente) continue;
    const dati = await FileSystem.readAsStringAsync(sorgente, { encoding: FileSystem.EncodingType.Base64 });
    await elencoFotoPermanenti(); // crea la cartella se serve
    const dest = `${CARTELLA_FOTO}${nomeFoto(uri)}`;
    await FileSystem.writeAsStringAsync(dest, dati, { encoding: FileSystem.EncodingType.Base64 });
    if (dest !== uri) await aggiornaIndirizzoFoto(uri, dest);
    recuperate++;
  }
  return { recuperate, mancanti: giaFatte.size - recuperate };
}

