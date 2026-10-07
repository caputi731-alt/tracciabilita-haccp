/**
 * Promemoria giornaliero delle temperature (notifica locale, funziona senza internet).
 * Ogni volta che l'app si apre o si registra una temperatura vengono riprogrammati gli avvisi
 * dei prossimi GIORNI_PROGRAMMATI giorni; quello di oggi viene tolto se le rilevazioni sono complete.
 * Toccando la notifica si apre la schermata Temperature con l'inserimento in sequenza.
 */
import * as Notifications from 'expo-notifications';
import { leggiPreferenza, salvaPreferenza, situazioneTemperature } from './database';

const CANALE = 'promemoria-temperature';
const GIORNI_PROGRAMMATI = 14;
export const ORA_PREDEFINITA = '10:00';

try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
} catch (e) { /* le notifiche non devono mai impedire l'avvio dell'app */ }

/** "9:5" / "09.05" / "0905" → "09:05"; non valido → null. */
export function normalizzaOra(testo) {
  const m = String(testo || '').trim().match(/^(\d{1,2})[:.,\s]?(\d{2})?$/);
  if (!m) return null;
  const h = Number(m[1]); const min = Number(m[2] || 0);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** Istanti dei prossimi promemoria: uno al giorno all'ora indicata, saltando oggi se già fatto o se l'ora è passata. */
export function prossimiPromemoria(ora, adesso, oggiCompleto, giorni = GIORNI_PROGRAMMATI) {
  const [h, m] = ora.split(':').map(Number);
  const date = [];
  for (let i = 0; i < giorni; i++) {
    const d = new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate() + i, h, m, 0, 0);
    if (d.getTime() <= adesso.getTime() + 30000) continue;
    if (i === 0 && oggiCompleto) continue;
    date.push(d);
  }
  return date;
}

export async function impostazioniPromemoria() {
  const attivo = await leggiPreferenza('promemoria_temperature');
  const ora = normalizzaOra(await leggiPreferenza('promemoria_temperature_ora')) || ORA_PREDEFINITA;
  let permesso = false;
  try { permesso = (await Notifications.getPermissionsAsync()).granted; } catch (e) { permesso = false; }
  return { attivo: attivo === '1', maiImpostato: attivo === null, ora, permesso };
}

async function preparaCanale() {
  await Notifications.setNotificationChannelAsync(CANALE, {
    name: 'Promemoria temperature',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
  });
}

let coda = Promise.resolve();

/** Riprogramma gli avvisi secondo le impostazioni salvate. Non lancia mai errori. */
export function aggiornaPromemoria() {
  coda = coda.then(async () => {
    try {
      const imp = await impostazioniPromemoria();
      await Notifications.cancelAllScheduledNotificationsAsync();
      if (!imp.attivo || !imp.permesso) return 0;
      await preparaCanale();
      const oggi = (await situazioneTemperature(1))[0];
      if (!oggi || oggi.totali === 0) return 0; // nessun frigorifero configurato: niente da ricordare
      const date = prossimiPromemoria(imp.ora, new Date(), oggi.completo);
      for (const date1 of date) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Temperature da registrare',
            body: 'Tocca per inserire le temperature dei frigoriferi.',
            data: { rotta: 'Temperature' },
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: date1, channelId: CANALE },
        });
      }
      return date.length;
    } catch (e) {
      return 0;
    }
  });
  return coda;
}

/** Attiva il promemoria (chiede il permesso delle notifiche). Restituisce false se il permesso è negato. */
export async function attivaPromemoria(ora) {
  let stato = await Notifications.getPermissionsAsync();
  if (!stato.granted) stato = await Notifications.requestPermissionsAsync();
  if (!stato.granted) return false;
  await salvaPreferenza('promemoria_temperature', '1');
  await salvaPreferenza('promemoria_temperature_ora', normalizzaOra(ora) || ORA_PREDEFINITA);
  await aggiornaPromemoria();
  return true;
}

export async function disattivaPromemoria() {
  await salvaPreferenza('promemoria_temperature', '0');
  await aggiornaPromemoria();
}

/** Notifica di prova tra pochi secondi, per controllare che il telefono le mostri. */
export async function notificaDiProva() {
  await preparaCanale();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Temperature da registrare',
      body: 'Questa è una prova: toccala per aprire l\'inserimento.',
      data: { rotta: 'Temperature' },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(Date.now() + 5000), channelId: CANALE },
  });
}

/**
 * Collega il tocco sulla notifica all'apertura della schermata.
 * apri(rotta) viene chiamata sia se l'app era aperta sia se è stata avviata dalla notifica.
 * Restituisce la funzione per scollegare.
 */
export function ascoltaToccoNotifica(apri) {
  // la stessa risposta può essere riproposta dal sistema ai successivi avvii: ogni tocco si gestisce una volta sola
  const viste = new Set();
  const gestisci = async (risposta) => {
    try {
      const richiesta = risposta?.notification?.request;
      const rotta = richiesta?.content?.data?.rotta;
      if (!rotta) return;
      const firma = `${richiesta.identifier}|${risposta.notification.date}`;
      if (viste.has(firma)) return;
      viste.add(firma);
      if ((await leggiPreferenza('notifica_gestita')) === firma) return;
      await salvaPreferenza('notifica_gestita', firma);
      apri(rotta);
    } catch (e) { /* ignora */ }
  };
  let sub = null;
  try {
    sub = Notifications.addNotificationResponseReceivedListener(gestisci);
    Notifications.getLastNotificationResponseAsync().then((r) => { if (r) gestisci(r); }).catch(() => {});
  } catch (e) { /* ignora */ }
  return () => { try { if (sub) sub.remove(); } catch (e) { /* ignora */ } };
}
