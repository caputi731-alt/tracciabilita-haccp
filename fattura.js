/**
 * Riconosce intestazione e righe articolo dal testo di una fattura/DDT in PDF.
 * Formato principale: tabella "ARTICOLO DESCRIZIONE CONF UM COLLI QTÀ PREZZO IMPORTO IVA"
 * (Altasfera / Maiora). Per altri layout prova un riconoscimento generico:
 * le righe vanno sempre verificate nella schermata di importazione.
 */

const UM = {
  KG: 'kg', PZ: 'pz', NR: 'pz', N: 'pz', LT: 'l', L: 'l', GR: 'g', G: 'g',
  CF: 'conf', CONF: 'conf', CT: 'cassa', ML: 'ml', BT: 'pz', MT: 'pz',
};
const UM_RE = Object.keys(UM).join('|');
const NUM = '\\d{1,3}(?:\\.\\d{3})*(?:,\\d+)?|\\d+(?:[.,]\\d+)?';

/** "1.234,56" → 1234.56 ; "4,50" → 4.5 */
export function numeroIt(s) {
  if (s === null || s === undefined) return null;
  let t = String(s).trim();
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const dataIso = (g) => {
  const m = g && g.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (!m) return null;
  const anno = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${anno}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
};

const RIGA_ALTASFERA = new RegExp(
  `^(\\d{4,})\\s+(.+?)\\s+(\\d+)\\s+(${UM_RE})\\s+(\\d+)\\s+(${NUM})\\s+(${NUM})\\s+(-?${NUM})\\s+(\\d{1,2})$`, 'i');

const RIGA_GENERICA = new RegExp(
  `^(?:(\\d{3,})\\s+)?(.*?[A-Za-zÀ-ú].*?)\\s+(${UM_RE})\\s+(${NUM})\\s+(${NUM})\\s+(-?${NUM})(?:\\s+(\\d{1,2}))?$`, 'i');

/**
 * @param {string[][]} pagine righe di testo per pagina (da estraiTestoPdf)
 * @param {string} [pivaPropria] P.IVA dell'attività, da escludere come fornitore
 */
export function analizzaFattura(pagine, pivaPropria = '') {
  const righe = pagine.flat();
  const tutto = righe.join('\n');

  // intestazione
  let numero = null;
  let data = null;
  const mNum = tutto.match(/Numero\s+([A-Z0-9/-]+)\s+del\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i)
    || tutto.match(/(?:fattura|documento|ddt)[^\n]*?n[°.r]*\s*[:.]?\s*([A-Z0-9/-]+)[^\n]*?(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (mNum) { numero = mNum[1]; data = dataIso(mNum[2]); }

  const proprie = String(pivaPropria || '').replace(/\D/g, '');
  const partiteIva = [];
  const reIva = /P\.?\s*IVA\s*[:.]?\s*(?:IT)?\s*(\d{11})/gi;
  let m;
  while ((m = reIva.exec(tutto))) {
    if (m[1] !== proprie && !partiteIva.includes(m[1])) partiteIva.push(m[1]);
  }
  const intestazione = righe[0] || '';

  const totaleM = tutto.match(new RegExp(`Totale\\s+Imponibile\\s*:?\\s*(${NUM})`, 'i'));
  const totaleImponibile = totaleM ? numeroIt(totaleM[1]) : null;
  const totDocM = tutto.match(new RegExp(`Totale\\s+Documento\\s*:?\\s*(${NUM})`, 'i'));
  const totaleDocumento = totDocM ? numeroIt(totDocM[1]) : null;

  // righe articolo
  const articoli = [];
  let ultimo = null;
  for (const riga of righe) {
    let a = riga.match(RIGA_ALTASFERA);
    if (a) {
      ultimo = {
        codice: a[1], descrizione: a[2].trim(), confezione: Number(a[3]),
        unita_misura: UM[a[4].toUpperCase()] || 'pz', colli: Number(a[5]),
        quantita: numeroIt(a[6]), prezzo_unitario: numeroIt(a[7]), importo: numeroIt(a[8]),
        iva: Number(a[9]), lotto: null, origine: null, scadenza: null,
      };
      articoli.push(ultimo);
      continue;
    }
    if (ultimo) {
      const id = riga.match(/Identificazione\s*=\s*(\S+)/i);
      const tr = riga.match(/Tracciabilit\S*\s*=\s*(\S+)/i);
      const lt = riga.match(/\blott?o\b\s*[:=n.°]*\s*([A-Z0-9/-]{3,})/i);
      const og = riga.match(/Origine\s*[=:]\s*(.+)$/i);
      const sc = riga.match(/scad\w*\s*[:=.]?\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})/i);
      if (id || tr || lt || og || sc) {
        if (id) ultimo.lotto = id[1];
        else if (lt) ultimo.lotto = lt[1];
        else if (tr && !ultimo.lotto) ultimo.lotto = tr[1];
        if (og) ultimo.origine = og[1].trim();
        if (sc) ultimo.scadenza = dataIso(sc[1]);
        continue;
      }
    }
    if (/^(totale|imponibile|contributo|condizioni|annotazioni)/i.test(riga)) { ultimo = null; continue; }
    ultimo = ultimo && /^\d{4,}\s/.test(riga) ? null : ultimo;
  }

  // riconoscimento generico se il layout principale non ha trovato nulla
  if (articoli.length === 0) {
    for (const riga of righe) {
      const g = riga.match(RIGA_GENERICA);
      if (!g || /totale|imponibile|iva\s+\d/i.test(riga)) continue;
      articoli.push({
        codice: g[1] || null, descrizione: g[2].trim(), confezione: null,
        unita_misura: UM[g[3].toUpperCase()] || 'pz', colli: null,
        quantita: numeroIt(g[4]), prezzo_unitario: numeroIt(g[5]), importo: numeroIt(g[6]),
        iva: g[7] ? Number(g[7]) : null, lotto: null, origine: null, scadenza: null,
      });
    }
  }

  const sommaRighe = Math.round(articoli.reduce((s, x) => s + (x.importo || 0), 0) * 100) / 100;

  return {
    numero, data, partiteIva, intestazione, articoli,
    totaleImponibile, totaleDocumento, sommaRighe,
    quadra: totaleImponibile !== null ? Math.abs(sommaRighe - totaleImponibile) < 0.05 : null,
  };
}

/** Chiave per ricordare l'abbinamento articolo fornitore → prodotto interno. */
export const chiaveArticolo = (a) =>
  a.codice ? `cod:${a.codice}` : `des:${a.descrizione.toUpperCase().replace(/\s+/g, ' ')}`;

/** Nome proposto per un nuovo prodotto a partire dalla descrizione in fattura. */
export function nomeProdottoProposto(descrizione) {
  const s = descrizione.replace(/\bALTASFERA\b/gi, '').replace(/\s+/g, ' ').trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
