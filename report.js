import * as Print from 'expo-print';
import { fmtData, fmtDataOra, ALLERGENI } from './theme';

const esc = (v) => {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

const CSS = `
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; padding: 0; }
  .head { border-bottom: 3px solid #1F6F5C; padding-bottom: 8px; margin-bottom: 14px; }
  .az { font-size: 18px; font-weight: 800; }
  .sub { font-size: 12px; color: #444; }
  h1 { font-size: 17px; margin: 4px 0 2px; }
  .periodo { font-size: 12px; color: #444; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #bbb; padding: 5px 6px; text-align: left; vertical-align: top; }
  th { background: #eef3f1; font-weight: 700; }
  .nc { color: #C0392B; font-weight: 700; }
  .ok { color: #1F6F5C; }
  .foot { margin-top: 20px; font-size: 10px; color: #666; border-top: 1px solid #ccc; padding-top: 6px; }
  .firma { margin-top: 34px; font-size: 12px; }
  .kv { font-size: 12px; margin: 3px 0; }
  .kv b { display: inline-block; min-width: 150px; }
`;

export function wrapDoc(titolo, corpo, imp = {}, periodo = '') {
  return `<html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
    <div class="head">
      <div class="az">${esc(imp.nome_attivita) || 'Attività alimentare'}</div>
      <div class="sub">${[esc(imp.indirizzo), imp.partita_iva ? 'P.IVA ' + esc(imp.partita_iva) : '']
        .filter(Boolean).join(' — ')}</div>
      <h1>${esc(titolo)}</h1>
      ${periodo ? `<div class="periodo">${esc(periodo)}</div>` : ''}
    </div>
    ${corpo}
    <div class="firma">Il responsabile: ${esc(imp.responsabile) || '____________________'}</div>
    <div class="foot">Documento generato il ${fmtDataOra(new Date().toISOString())} — App Tracciabilità HACCP</div>
  </body></html>`;
}

export async function stampa(html) {
  await Print.printAsync({ html });
}

/** Tabella allergeni dei piatti (Reg. UE 1169/2011), A4 orizzontale. */
export function htmlTabellaAllergeni(piatti, imp = {}) {
  const intest = ALLERGENI.map((a) => `<th class="rot"><div>${esc(a)}</div></th>`).join('');
  const righe = piatti.map((p) => `<tr>
      <td class="piatto">${esc(p.nome)}${p.categoria ? `<div class="cat">${esc(p.categoria)}</div>` : ''}</td>
      ${ALLERGENI.map((a) => `<td class="c">${p.allergeni.includes(a) ? '●' : ''}</td>`).join('')}
    </tr>`).join('');
  const daVerificare = piatti.filter((p) => p.daVerificare.length || p.senzaIngredienti);
  const avvisi = daVerificare.length ? `<div class="avviso"><b>Da verificare prima dell'esposizione:</b><ul>${
    daVerificare.map((p) => `<li>${esc(p.nome)}: ${p.senzaIngredienti ? 'ricetta senza ingredienti'
      : `allergeni non confermati per ${esc(p.daVerificare.join(', '))}`}</li>`).join('')}</ul></div>` : '';
  const corpo = `
    <style>
      @page { size: A4 landscape; margin: 10mm; }
      th.rot { height: 110px; vertical-align: bottom; padding: 4px 2px; width: 38px; }
      th.rot div { writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; font-size: 11px; margin: 0 auto; }
      td.c { text-align: center; font-size: 15px; color: #B03A2E; }
      td.piatto { font-weight: 700; font-size: 12px; }
      .cat { font-weight: 400; color: #666; font-size: 10px; }
      .avviso { margin-top: 12px; border: 2px solid #C77A12; padding: 6px 10px; font-size: 11px; }
      .legale { margin-top: 10px; font-size: 11px; }
    </style>
    <table><thead><tr><th>Piatto</th>${intest}</tr></thead>
    <tbody>${righe || `<tr><td colspan="${ALLERGENI.length + 1}">Nessuna ricetta registrata</td></tr>`}</tbody></table>
    <div class="legale">● = contiene l'allergene o suoi derivati (Reg. UE 1169/2011, allegato II).
      Le preparazioni possono contenere tracce di altri allergeni per contaminazione crociata:
      chiedere sempre al personale.</div>
    ${avvisi}`;
  return wrapDoc('Informazioni sugli allergeni dei piatti', corpo, imp);
}

export { esc, fmtData, fmtDataOra };
