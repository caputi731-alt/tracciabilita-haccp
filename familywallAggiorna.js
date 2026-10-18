/**
 * Aggiornamento delle prenotazioni da Family Wall: scarica il calendario dal link salvato, lo legge e applica le differenze
 * (familywall.js + database.js). Senza rete non cambia niente: restano le prenotazioni scaricate l'ultima volta.
 * Ricorda quando è andato a buon fine (`familywall_ultimo`) e l'ultimo errore (`familywall_errore`), nelle preferenze locali.
 */
import { leggiIcs, scaricaCalendario } from './familywall';
import { leggiPreferenza, salvaPreferenza, applicaCalendario, exec } from './database';

export const MINUTI_TRA_AGGIORNAMENTI = 15; // aprendo la Sala si riscarica solo se l'ultima volta è più vecchia di così

/** Lo stato del collegamento: { collegato, ultimo (ISO o null), errore (testo o null) }. Il link non esce da qui. */
export async function statoFamilyWall() {
  const [link, ultimo, errore] = await Promise.all(['familywall_link', 'familywall_ultimo', 'familywall_errore'].map(leggiPreferenza));
  return { collegato: !!link, ultimo: ultimo || null, errore: errore || null };
}

/** → { nuove, cambiate, sparite }. Lancia un errore leggibile se manca il link o la rete. `fetchFn` serve ai test. */
export async function aggiornaDaFamilyWall({ fetchFn } = {}) {
  const link = await leggiPreferenza('familywall_link');
  if (!link) throw new Error('Collega prima il calendario di Family Wall');
  try {
    const testo = await scaricaCalendario(link, fetchFn ? { fetchFn } : {});
    const esito = await applicaCalendario(leggiIcs(testo));
    await salvaPreferenza('familywall_ultimo', new Date().toISOString());
    await exec("DELETE FROM preferenze WHERE chiave = 'familywall_errore'");
    return esito;
  } catch (e) {
    await salvaPreferenza('familywall_errore', String((e && e.message) || e)).catch(() => {});
    throw e;
  }
}

/** Da chiamare aprendo la Sala: aggiorna solo se collegato e se è passato abbastanza tempo; senza rete tace. → esito o null */
export async function aggiornaSeServe({ fetchFn } = {}) {
  const { collegato, ultimo } = await statoFamilyWall();
  if (!collegato) return null;
  if (ultimo && Date.now() - new Date(ultimo).getTime() < MINUTI_TRA_AGGIORNAMENTI * 60000) return null;
  try {
    return await aggiornaDaFamilyWall({ fetchFn });
  } catch (e) {
    return null;
  }
}
