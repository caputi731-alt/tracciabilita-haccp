/**
 * Backup automatico giornaliero in una cartella scelta dall'utente (Storage Access Framework).
 * La cartella è fuori dall'app: il backup sopravvive anche alla disinstallazione.
 * Si conservano le ultime MAX_COPIE copie.
 */
import * as FileSystem from 'expo-file-system';
import { esportaTutto, leggiPreferenza, salvaPreferenza } from './database';

const SAF = FileSystem.StorageAccessFramework;
export const MAX_COPIE = 14;
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
    const contenuto = JSON.stringify(await esportaTutto());
    const uri = await SAF.createFileAsync(cartella, `${PREFISSO}${timbro()}`, 'application/json');
    await FileSystem.writeAsStringAsync(uri, contenuto, { encoding: FileSystem.EncodingType.UTF8 });

    const file = (await SAF.readDirectoryAsync(cartella))
      .filter((u) => nomeDaUri(u).startsWith(PREFISSO))
      .sort((a, b) => (nomeDaUri(a) < nomeDaUri(b) ? 1 : -1));
    for (const vecchio of file.slice(MAX_COPIE)) {
      try { await FileSystem.deleteAsync(vecchio, { idempotent: true }); } catch (e) { /* non bloccante */ }
    }
    await salvaPreferenza('backup_ultimo', new Date().toISOString());
    await salvaPreferenza('backup_errore', null);
    return { nome: nomeDaUri(uri), copie: Math.min(file.length, MAX_COPIE), byte: contenuto.length };
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
