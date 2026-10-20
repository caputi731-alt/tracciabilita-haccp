/**
 * Magazzino compatto (proposta A del 20/10/2026, fase 6). Modulo puro (provato in test/magazzino.test.mjs):
 * le dosi dello scarico rapido e l'etichetta breve della scadenza. La schermata è MagazzinoScreen.js.
 *
 * Dosi scelte da Luca: a peso o volume (kg, l) 0,5 e 1; a pezzi e confezioni (pz, conf, cassa) 1 e 2; per g e ml 100 e 500.
 * "Tutto" = quanto resta nel primo lotto da usare (FIFO). Una dose più grande di quanto c'è non viene proposta.
 */
import { arrotonda, piuGiorni } from './utile';

const DOSI = { kg: [0.5, 1], l: [0.5, 1], g: [100, 500], ml: [100, 500] };
const A_PEZZI = [1, 2];

/**
 * @param unita        unità di misura del gruppo
 * @param disponibile  quantità utilizzabile in tutto (lotti non scaduti)
 * @param primo        quanto resta nel primo lotto da usare
 * @returns {{ testo: string, qta: number }[]}
 */
export function dosiRapide(unita, disponibile, primo) {
  const u = String(unita || '').toLowerCase();
  const dosi = (DOSI[u] || A_PEZZI).filter((d) => d <= disponibile + 1e-9);
  const testo = (n) => String(arrotonda(n)).replace('.', ',');
  const out = dosi.map((d) => ({ testo: `${testo(d)} ${u}`.trim(), qta: d }));
  const tutto = arrotonda(Number(primo) || 0);
  if (tutto > 0 && !dosi.some((d) => Math.abs(d - tutto) < 1e-9)) out.push({ testo: 'Tutto', qta: tutto });
  return out;
}

/** Etichetta breve della scadenza per la riga: 'scaduto', 'oggi', 'domani', 'gg/mm' entro 7 giorni; null se lontana o assente. */
export function scadenzaBreve(iso, oggi) {
  if (!iso) return null;
  const g = String(iso).slice(0, 10);
  if (g < oggi) return { testo: 'scaduto', tono: 'grave' };
  if (g === oggi) return { testo: 'oggi', tono: 'fare' };
  if (g === piuGiorni(oggi, 1)) return { testo: 'domani', tono: 'fare' };
  if (g <= piuGiorni(oggi, 7)) return { testo: `${g.slice(8, 10)}/${g.slice(5, 7)}`, tono: g <= piuGiorni(oggi, 3) ? 'fare' : 'info' };
  return null;
}
