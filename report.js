import * as Print from 'expo-print';
import { fmtData, fmtDataOra } from './theme';

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

export { esc, fmtData, fmtDataOra };
