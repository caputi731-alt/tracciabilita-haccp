/** Crea file (PDF, CSV, backup) nella memoria temporanea e apre "Condividi" di Android (WhatsApp, email, Drive…). */
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';

const CARTELLA = `${FileSystem.cacheDirectory}condivisi/`;

const nomePulito = (nome) => String(nome).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-');

/** Cartella temporanea svuotata a ogni uso: i file condivisi non si accumulano nella memoria dell'app. */
async function cartellaPulita() {
  try { await FileSystem.deleteAsync(CARTELLA, { idempotent: true }); } catch (e) { /* ignora */ }
  await FileSystem.makeDirectoryAsync(CARTELLA, { intermediates: true });
}

async function condividi(uri, mime, titolo) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('La condivisione non è disponibile su questo telefono.');
  await Sharing.shareAsync(uri, { mimeType: mime, dialogTitle: titolo });
}

/** HTML → file PDF con un nome leggibile, poi "Condividi". */
export async function condividiPdf(html, nome) {
  const { uri } = await Print.printToFileAsync({ html });
  await cartellaPulita();
  const destinazione = `${CARTELLA}${nomePulito(nome)}.pdf`;
  await FileSystem.moveAsync({ from: uri, to: destinazione });
  await condividi(destinazione, 'application/pdf', nome);
}

/** Testo (CSV, JSON) → file, poi "Condividi". */
export async function condividiTesto(nomeFile, contenuto, mime) {
  await cartellaPulita();
  const destinazione = `${CARTELLA}${nomePulito(nomeFile)}`;
  await FileSystem.writeAsStringAsync(destinazione, contenuto, { encoding: FileSystem.EncodingType.UTF8 });
  await condividi(destinazione, mime, nomeFile);
}
