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

export async function elencoFotoPermanenti() {
  await preparaCartella();
  return FileSystem.readDirectoryAsync(CARTELLA_FOTO);
}
