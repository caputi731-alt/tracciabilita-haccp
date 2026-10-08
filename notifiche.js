/**
 * Promemoria giornalieri (notifiche locali, funzionano senza internet): temperature, pulizie e scadenze.
 * Ogni volta che l'app si apre o si registra qualcosa vengono riprogrammati gli avvisi dei prossimi
 * GIORNI_PROGRAMMATI giorni; quello di oggi viene tolto se non c'è più niente da fare.
 *  - temperature: toccando la notifica si apre Temperature con l'inserimento in sequenza;
 *  - pulizie: un avviso al giorno finché ci sono aree da fare, apre Sanificazione;
 *  - scadenze: solo nei giorni in cui qualcosa scade (oggi o domani) o è già scaduto, con i nomi dei prodotti; apre Magazzino.
 * Le notifiche si preparano in anticipo: quelle dei giorni futuri riflettono la situazione dell'ultima apertura dell'app.
 */
import * as Notifications from 'expo-notifications';
import { leggiPreferenza, salvaPreferenza, situazioneTemperature, areeConStato, lottiInScadenza } from './database';
import { isoLocale, piuGiorni } from './utile';

const CANALE = 'promemoria-temperature';
const GIORNI_PROGRAMMATI = 14;
export const ORA_PREDEFINITA = '10:00';

/** I tre promemoria: preferenze, canale Android, ora proposta, schermata aperta dal tocco. */
export const PROMEMORIA = {
  temperature: { chiave: 'promemoria_temperature', canale: CANALE, nomeCanale: 'Promemoria temperature', ora: ORA_PREDEFINITA,
    rotta: 'Temperature', titolo: 'Temperature da registrare', testo: 'Tocca per inserire le temperature dei frigoriferi.' },
  pulizie: { chiave: 'promemoria_pulizie', canale: 'promemoria-pulizie', nomeCanale: 'Promemoria pulizie', ora: '15:00',
    rotta: 'Sanificazione', titolo: 'Pulizie da registrare', testo: 'Tocca per segnare le pulizie fatte oggi.' },
  scadenze: { chiave: 'promemoria_scadenze', canale: 'promemoria-scadenze', nomeCanale: 'Promemoria scadenze', ora: '08:00',
    rotta: 'Magazzino', titolo: 'Merce in scadenza', testo: 'Tocca per vedere i lotti in scadenza.' },
};

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

/**
 * Avvisi delle scadenze per i prossimi giorni: uno al giorno all'ora indicata, solo se quel giorno qualcosa scade
 * (o scade l'indomani). Oggi comprende anche i lotti già scaduti ancora in giacenza.
 * `lotti` = [{ prodotto, data_scadenza }] in giacenza; → [{ data (Date), testo }].
 */
export function avvisiScadenze(lotti, ora, adesso, giorni = GIORNI_PROGRAMMATI) {
  const [h, m] = ora.split(':').map(Number);
  const oggi = isoLocale(adesso);
  const nomi = (elenco) => {
    const unici = [...new Set(elenco.map((l) => String(l.prodotto || 'prodotto')))];
    return unici.length > 4 ? `${unici.slice(0, 4).join(', ')} e altri ${unici.length - 4}` : unici.join(', ');
  };
  const giornoDi = (l) => String(l.data_scadenza || '').slice(0, 10);
  const out = [];
  for (let i = 0; i < giorni; i++) {
    const quando = new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate() + i, h, m, 0, 0);
    if (quando.getTime() <= adesso.getTime() + 30000) continue;
    const giorno = piuGiorni(oggi, i);
    const domani = piuGiorni(oggi, i + 1);
    const parti = [];
    const scaduti = i === 0 ? lotti.filter((l) => giornoDi(l) && giornoDi(l) < giorno) : [];
    const oggiScade = lotti.filter((l) => giornoDi(l) === giorno);
    const domaniScade = lotti.filter((l) => giornoDi(l) === domani);
    if (scaduti.length) parti.push(`Già scaduti: ${nomi(scaduti)}.`);
    if (oggiScade.length) parti.push(`Scade oggi: ${nomi(oggiScade)}.`);
    if (domaniScade.length) parti.push(`Scade domani: ${nomi(domaniScade)}.`);
    if (parti.length) out.push({ data: quando, testo: parti.join(' ') });
  }
  return out;
}

export async function impostazioniPromemoria(tipo = 'temperature') {
  const P = PROMEMORIA[tipo];
  const attivo = await leggiPreferenza(P.chiave);
  const ora = normalizzaOra(await leggiPreferenza(`${P.chiave}_ora`)) || P.ora;
  let permesso = false;
  try { permesso = (await Notifications.getPermissionsAsync()).granted; } catch (e) { permesso = false; }
  return { attivo: attivo === '1', maiImpostato: attivo === null, ora, permesso };
}

async function preparaCanale(tipo = 'temperature') {
  await Notifications.setNotificationChannelAsync(PROMEMORIA[tipo].canale, {
    name: PROMEMORIA[tipo].nomeCanale,
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
  });
}

let coda = Promise.resolve();

const programma = (tipo, data, testo) => Notifications.scheduleNotificationAsync({
  content: { title: PROMEMORIA[tipo].titolo, body: testo || PROMEMORIA[tipo].testo, data: { rotta: PROMEMORIA[tipo].rotta } },
  trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: data, channelId: PROMEMORIA[tipo].canale },
});

/** Riprogramma tutti gli avvisi secondo le impostazioni salvate. Non lancia mai errori. */
export function aggiornaPromemoria() {
  coda = coda.then(async () => {
    let quanti = 0;
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      const adesso = new Date();
      // un promemoria che fallisce non ferma gli altri
      const fai = async (tipo, date) => {
        try {
          const imp = await impostazioniPromemoria(tipo);
          if (!imp.attivo || !imp.permesso) return;
          const elenco = await date(imp);
          if (!elenco.length) return;
          await preparaCanale(tipo);
          for (const d of elenco) { await programma(tipo, d.data || d, d.testo); quanti++; }
        } catch (e) { /* ignora */ }
      };
      await fai('temperature', async (imp) => {
        const oggi = (await situazioneTemperature(1))[0];
        if (!oggi || oggi.totali === 0) return []; // nessun frigorifero configurato: niente da ricordare
        return prossimiPromemoria(imp.ora, adesso, oggi.completo);
      });
      await fai('pulizie', async (imp) => {
        const aree = await areeConStato();
        if (!aree.length) return [];
        return prossimiPromemoria(imp.ora, adesso, !aree.some((a) => a.daFare));
      });
      await fai('scadenze', async (imp) => avvisiScadenze(
        (await lottiInScadenza(GIORNI_PROGRAMMATI + 1)).filter((l) => l.quantita_residua > 0), imp.ora, adesso));
    } catch (e) { /* ignora */ }
    return quanti;
  });
  return coda;
}

/** Attiva un promemoria (chiede il permesso delle notifiche). Restituisce false se il permesso è negato. */
export async function attivaPromemoria(ora, tipo = 'temperature') {
  let stato = await Notifications.getPermissionsAsync();
  if (!stato.granted) stato = await Notifications.requestPermissionsAsync();
  if (!stato.granted) return false;
  await salvaPreferenza(PROMEMORIA[tipo].chiave, '1');
  await salvaPreferenza(`${PROMEMORIA[tipo].chiave}_ora`, normalizzaOra(ora) || PROMEMORIA[tipo].ora);
  await aggiornaPromemoria();
  return true;
}

export async function disattivaPromemoria(tipo = 'temperature') {
  await salvaPreferenza(PROMEMORIA[tipo].chiave, '0');
  await aggiornaPromemoria();
}

/** Notifica di prova tra pochi secondi, per controllare che il telefono le mostri. */
export async function notificaDiProva(tipo = 'temperature') {
  await preparaCanale(tipo);
  await programma(tipo, new Date(Date.now() + 5000), 'Questa è una prova: toccala per aprire la schermata.');
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
