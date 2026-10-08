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
