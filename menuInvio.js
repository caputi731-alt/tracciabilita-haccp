/**
 * Azioni del telefono chieste dall'app web del Menù: aprire, salvare e inviare i file (PDF, immagini, backup).
 * Rifà in React Native quello che nell'app Android del Menù faceva MainActivity.java.
 */
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Clipboard from 'expo-clipboard';
import Share from 'react-native-share';
import { nomeFilePulito, numeroWhatsApp, tipoComune } from './menuPonte';

const CARTELLA = `${FileSystem.cacheDirectory}menu-condivisi/`;
const SAF = FileSystem.StorageAccessFramework;
const UN_GIORNO = 24 * 60 * 60 * 1000;

/** I file preparati per l'invio restano nella memoria temporanea: quelli più vecchi di un giorno si eliminano. */
export async function pulisciCondivisi() {
  try {
    const nomi = await FileSystem.readDirectoryAsync(CARTELLA);
    for (const n of nomi) {
      const info = await FileSystem.getInfoAsync(`${CARTELLA}${n}`);
      if (info.exists && info.modificationTime && Date.now() - info.modificationTime * 1000 > UN_GIORNO) {
        await FileSystem.deleteAsync(`${CARTELLA}${n}`, { idempotent: true });
      }
    }
  } catch (e) { /* la cartella non c'è ancora */ }
}

async function scriviFile(nome, base64) {
  await FileSystem.makeDirectoryAsync(CARTELLA, { intermediates: true });
  const uri = `${CARTELLA}${nomeFilePulito(nome)}`;
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  return uri;
}

/** Apre il file con l'app adatta (per esempio il lettore PDF) oppure, con condividi, mostra "Condividi". */
export async function apriOCondividi({ base64, nome, mime, condividi }) {
  const uri = await scriviFile(nome, base64);
  const tipo = mime || 'application/octet-stream';
  if (condividi) {
    await Sharing.shareAsync(uri, { mimeType: tipo, dialogTitle: 'Invia il menù' });
    return;
  }
  const contenuto = await FileSystem.getContentUriAsync(uri);
  // flags 1 = permesso di lettura per l'app che apre il file
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', { data: contenuto, type: tipo, flags: 1 });
}

/** "Salva con nome": si sceglie la cartella (telefono, Drive…) e il file viene scritto lì. true solo se è stato scritto. */
export async function salvaConNome({ base64, nome, mime }) {
  const permesso = await SAF.requestDirectoryPermissionsAsync();
  if (!permesso.granted) return false;
  const pulito = nomeFilePulito(nome);
  // Android aggiunge da solo l'estensione giusta per il tipo di file
  const senzaEstensione = pulito.replace(/\.[A-Za-z0-9]{1,5}$/, '') || pulito;
  const destinazione = await SAF.createFileAsync(permesso.directoryUri, senzaEstensione, mime || 'application/octet-stream');
  await FileSystem.writeAsStringAsync(destinazione, base64, { encoding: FileSystem.EncodingType.Base64 });
  return true;
}

/**
 * Invia uno o più file con un messaggio. json = { files: [{ name, mime, data (base64) }], text, whatsapp, phone }.
 * Con whatsapp apre WhatsApp (o WhatsApp Business), sulla chat del cliente se c'è il numero;
 * se non è installato mostra il normale "Condividi". Il testo va anche negli appunti, perché
 * WhatsApp a volte scarta la didascalia dei documenti.
 * Restituisce true se il testo è stato copiato negli appunti.
 */
export async function inviaFile(json) {
  const o = JSON.parse(json);
  const file = Array.isArray(o.files) ? o.files : [];
  const testo = String(o.text || '');
  const uri = [];
  for (const f of file) uri.push(await scriviFile(f.name, f.data));

  let copiato = false;
  if (testo) {
    try { await Clipboard.setStringAsync(testo); copiato = true; } catch (e) { copiato = false; }
  }

  const tipo = file.length ? tipoComune(file) : 'text/plain';
  const unaImmagine = uri.length === 1 && tipo.startsWith('image/');
  const base = { type: tipo, failOnCancel: false };
  if (testo) base.message = testo;
  // una sola immagine: invio semplice, WhatsApp usa sempre il testo come didascalia; altrimenti invio multiplo
  if (unaImmagine) base.url = uri[0];
  else if (uri.length) base.urls = uri;

  if (o.whatsapp) {
    const numero = numeroWhatsApp(o.phone);
    for (const [social, pacchetto] of [[Share.Social.WHATSAPP, 'com.whatsapp'], [Share.Social.WHATSAPPBUSINESS, 'com.whatsapp.w4b']]) {
      let installato = false;
      try { installato = !!(await Share.isPackageInstalled(pacchetto)).isInstalled; } catch (e) { installato = false; }
      if (!installato) continue;
      const opzioni = { ...base, social };
      if (numero) opzioni.whatsAppNumber = numero;
      await Share.shareSingle(opzioni);
      return copiato;
    }
  }
  await Share.open({ ...base, title: 'Invia' });
  return copiato;
}
