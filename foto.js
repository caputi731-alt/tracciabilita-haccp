/**
 * Foto di etichette e documenti: copiate nella memoria permanente dell'app.
 * Le foto scattate o scelte dalla galleria arrivano in una cartella temporanea (cache)
 * che Android può svuotare in qualsiasi momento: vanno sempre copiate qui.
 */
import * as FileSystem from 'expo-file-system';

export const CARTELLA_FOTO = `${FileSystem.documentDirectory}foto/`;

export const nomeFoto = (uri) => (uri ? String(uri).split('/').pop() : '');

async function preparaCartella() {
  const info = await FileSystem.getInfoAsync(CARTELLA_FOTO);
  if (!info.exists) await FileSystem.makeDirectoryAsync(CARTELLA_FOTO, { intermediates: true });
}

export async function esisteFoto(uri) {
  if (!uri) return false;
  try { return (await FileSystem.getInfoAsync(uri)).exists; } catch (e) { return false; }
}

/** Copia la foto nella cartella permanente e restituisce il nuovo indirizzo. */
export async function rendiPermanente(uri, prefisso = 'foto') {
  if (!uri) return null;
  if (String(uri).startsWith(CARTELLA_FOTO)) return uri;
  await preparaCartella();
  const destinazione = `${CARTELLA_FOTO}${prefisso}-${Date.now()}-${Math.floor(Math.random() * 1000)}.jpg`;
  await FileSystem.copyAsync({ from: uri, to: destinazione });
  return destinazione;
}

/**
 * Elimina le foto non più collegate a nessun record (sostituite, o scattate in moduli poi abbandonati).
 * usate: nomi dei file ancora in uso. Le foto recenti (meno di giorniMinimi) non si toccano:
 * potrebbero appartenere a un modulo ancora aperto. Restituisce quante ne ha eliminate.
 */
export async function eliminaFotoOrfane(usate, giorniMinimi = 3) {
  const limite = Date.now() / 1000 - giorniMinimi * 86400;
  let eliminate = 0;
  for (const nome of await elencoFotoPermanenti()) {
    if (usate.has(nome)) continue;
    try {
      const info = await FileSystem.getInfoAsync(`${CARTELLA_FOTO}${nome}`);
      if (!info.exists || !info.modificationTime || info.modificationTime > limite) continue;
      await FileSystem.deleteAsync(`${CARTELLA_FOTO}${nome}`, { idempotent: true });
      eliminate++;
    } catch (e) { /* si riprova al prossimo avvio */ }
  }
  return eliminate;
}

export async function elencoFotoPermanenti() {
  await preparaCartella();
  return FileSystem.readDirectoryAsync(CARTELLA_FOTO);
}
