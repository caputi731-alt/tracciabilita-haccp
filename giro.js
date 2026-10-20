/**
 * Giro di controllo guidato: l'elenco dei passi di oggi, uno per ogni cosa ancora da fare.
 * Solo calcolo (provato in test/giro.test.mjs); la schermata è GiroScreen.js.
 *  - una temperatura per ogni frigorifero attivo che oggi non ne ha ancora una;
 *  - una pulizia per ogni area "da fare" secondo la sua frequenza;
 *  - alla fine, se serve, il controllo dei lotti scaduti o che scadono entro domani.
 */
export function passiGiro({ punti = [], temperatureOggi = [], aree = [], lotti = [], oggi, domani }) {
  const rilevati = new Set(temperatureOggi.map((t) => t.punto_controllo_id));
  const passi = [];
  for (const p of punti) if (!rilevati.has(p.id)) passi.push({ tipo: 'temperatura', punto: p });
  for (const a of aree) if (a.daFare) passi.push({ tipo: 'pulizia', area: a });
  const vicini = lotti.filter((l) => l.quantita_residua > 0 && l.data_scadenza && String(l.data_scadenza).slice(0, 10) <= domani)
    .map((l) => {
      const g = String(l.data_scadenza).slice(0, 10);
      return { ...l, quando: g < oggi ? 'scaduto' : g === oggi ? 'oggi' : 'domani' };
    });
  if (vicini.length) passi.push({ tipo: 'scadenze', lotti: vicini });
  return passi;
}

const plurale = (n, uno, molti) => `${n} ${n === 1 ? uno : molti}`;

/** Giorni fra due date ISO (AAAA-MM-GG), contati sul calendario. */
function giorniFra(da, a) {
  const [y1, m1, d1] = da.split('-').map(Number); const [y2, m2, d2] = a.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

/**
 * Riquadro "Oggi" sotto la mappa delle cucine (proposta A, fase 3): titolo e promemoria toccabili.
 * `scadenze` = lotti che scadono a breve (con prodotto e data_scadenza). Ogni promemoria ha `tipo` (temperature, pulizie,
 * scadenze) per sapere cosa aprire e `tono`: 'fare' (da fare oggi), 'grave' (scaduto), 'info' (scadenza vicina).
 */
export function riquadroOggi({ tempMancanti = 0, pulizieMancanti = 0, totali = 0, scadenze = [], oggi }) {
  const mancanti = tempMancanti + pulizieMancanti;
  const titolo = totali === 0 ? 'Nessun controllo impostato'
    : mancanti === 0 ? 'Tutto fatto per oggi'
    : mancanti === 1 ? 'Oggi manca 1 cosa' : `Oggi mancano ${mancanti} cose`;
  const promemoria = [];
  if (tempMancanti) promemoria.push({ tipo: 'temperature', testo: plurale(tempMancanti, 'temperatura', 'temperature'), tono: 'fare' });
  if (pulizieMancanti) promemoria.push({ tipo: 'pulizie', testo: plurale(pulizieMancanti, 'pulizia', 'pulizie'), tono: 'fare' });
  const conData = scadenze.filter((l) => l && l.data_scadenza);
  const scaduti = conData.filter((l) => String(l.data_scadenza).slice(0, 10) < oggi);
  if (scaduti.length) {
    promemoria.push({ tipo: 'scadenze', testo: plurale(scaduti.length, 'lotto scaduto', 'lotti scaduti'), tono: 'grave',
      lottoId: scaduti.length === 1 ? scaduti[0].id : null });
  } else if (conData.length === 1) {
    const l = conData[0];
    const g = giorniFra(oggi, String(l.data_scadenza).slice(0, 10));
    const quando = g === 0 ? 'scade oggi' : g === 1 ? 'scade domani' : `scade fra ${g} giorni`;
    promemoria.push({ tipo: 'scadenze', testo: `${l.prodotto} ${quando}`, tono: g === 0 ? 'fare' : 'info', lottoId: l.id });
  } else if (conData.length > 1) {
    promemoria.push({ tipo: 'scadenze', testo: plurale(conData.length, 'scadenza vicina', 'scadenze vicine'), tono: 'info', lottoId: null });
  }
  return { titolo, mancanti, fatti: Math.max(0, totali - mancanti), totali, promemoria };
}
