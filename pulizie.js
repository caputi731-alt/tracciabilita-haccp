/**
 * Pulizie a un tocco (proposta A del 20/10/2026, fase 5). Modulo puro (provato in test/pulizie.test.mjs): per ogni area dice
 * cosa mostrare accanto al cerchio da toccare. La schermata è SanificazioneScreen.js.
 */
import { piuGiorni } from './utile';

const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const FREQUENZA = { giornaliera: 'Ogni giorno', settimanale: 'Ogni settimana', mensile: 'Ogni mese', 'a fine servizio': 'A fine servizio' };
export const MINUTI_ANNULLA_PULIZIA = 10; // come MINUTI_ANNULLA di database.js

const ora = (iso) => new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

/** Nome del giorno fra `n` giorni: "domani", "venerdì", oppure "fra 12 giorni". */
function quandoFra(oggi, n) {
  if (n <= 1) return 'domani';
  if (n < 7) {
    const [a, m, g] = piuGiorni(oggi, n).split('-').map(Number);
    return GIORNI[new Date(a, m - 1, g, 12).getDay()];
  }
  return `fra ${n} giorni`;
}

/**
 * @param area      riga di areeConStato (daFare, giorniFa, intervallo, frequenza, prodotto_previsto)
 * @param fatta     ultima pulizia di oggi di quell'area (con data_ora e creato_il), o null
 * @param adesso    istante in millisecondi (per sapere se si può ancora annullare)
 * @returns {{ stato: 'fatta'|'fare'|'aposto', testo: string, annullabile: boolean }}
 */
export function rigaPulizia(area, fatta, oggi, adesso = Date.now()) {
  const freq = FREQUENZA[area.frequenza] || area.frequenza || 'Ogni giorno';
  const prodotto = area.prodotto_previsto ? ` · ${area.prodotto_previsto}` : '';
  if (fatta) {
    const eta = fatta.creato_il ? adesso - new Date(fatta.creato_il).getTime() : Infinity;
    return { stato: 'fatta', testo: `${freq} · fatta alle ${ora(fatta.data_ora)}`, annullabile: eta >= -60000 && eta <= MINUTI_ANNULLA_PULIZIA * 60000 };
  }
  if (area.daFare) {
    const ultima = area.giorniFa === null || area.giorniFa === undefined ? 'mai fatta'
      : area.giorniFa === 1 ? 'ultima ieri' : `ultima ${area.giorniFa} giorni fa`;
    return { stato: 'fare', testo: `${freq} · da fare${area.intervallo > 1 ? ` (${ultima})` : ''}${prodotto}`, annullabile: false };
  }
  const mancano = Math.max(1, (area.intervallo || 1) - (area.giorniFa || 0));
  return { stato: 'aposto', testo: `${freq} · prossima ${quandoFra(oggi, mancano)}`, annullabile: false };
}

/** Riepilogo in cima: "2 da fare · 3 fatte oggi". */
export function riepilogoPulizie(righe) {
  const fare = righe.filter((r) => r.stato === 'fare').length;
  const fatte = righe.filter((r) => r.stato === 'fatta').length;
  if (!righe.length) return '';
  if (!fare) return fatte ? 'Tutto pulito per oggi' : 'Nessuna pulizia da fare oggi';
  return [`${fare} da fare`, fatte ? `${fatte} ${fatte === 1 ? 'fatta' : 'fatte'} oggi` : ''].filter(Boolean).join(' · ');
}
