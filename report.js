import * as Print from 'expo-print';
import { fmtData, fmtDataOra, ALLERGENI } from './theme';
import { disponi, LARGO as LARGO_TAVOLO } from './sale';

const esc = (v) => {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};
const num = (n) => (n === null || n === undefined ? '' : String(Math.round(Number(n) * 1000) / 1000).replace('.', ','));

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
  .avvisoGiorni { margin-top: 10px; border: 2px solid #9A5B00; padding: 6px 10px; font-size: 11px; }
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
/** Corpo HTML della tabella allergeni (senza intestazione del documento). */
export function corpoTabellaAllergeni(piatti) {
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
  return corpo;
}

/** Tabella allergeni dei piatti (Reg. UE 1169/2011), A4 orizzontale. */
export function htmlTabellaAllergeni(piatti, imp = {}) {
  return wrapDoc('Informazioni sugli allergeni dei piatti', corpoTabellaAllergeni(piatti), imp);
}

/**
 * Scheda allergeni di un evento (A4 orizzontale): una riga per portata del menù, con gli allergeni presi dalle ricette
 * o indicati a mano nel Menù. `righe` viene da allergeniEvento() (evento.js): le portate senza dati non risultano
 * "senza allergeni", sono segnate come da completare.
 */
export function htmlSchedaAllergeniEvento(evento, righe, imp = {}) {
  const intest = ALLERGENI.map((a, i) => `<th class="rot"><div>${i + 1}. ${esc(a)}</div></th>`).join('');
  let sezione = null;
  const corpoRighe = righe.map((p) => {
    const titolo = `${p.sezione}${p.bambini ? ' (bambini)' : ''}`;
    const cambio = titolo !== sezione ? `<tr><td class="sez" colspan="${ALLERGENI.length + 1}">${esc(titolo)}</td></tr>` : '';
    sezione = titolo;
    const celle = p.stato === 'manca'
      ? `<td class="manca" colspan="${ALLERGENI.length}">Allergeni non indicati: chiedere in cucina</td>`
      : ALLERGENI.map((a, i) => `<td class="c">${p.numeri.includes(i + 1) ? '●' : ''}</td>`).join('');
    return `${cambio}<tr><td class="piatto">${esc(p.nome)}${p.stato === 'verifica' ? ' <span class="nc">*</span>' : ''}</td>${celle}</tr>`;
  }).join('');
  const dubbi = righe.filter((p) => p.stato !== 'ok');
  const avvisi = dubbi.length ? `<div class="avviso"><b>Da completare prima di consegnare la scheda:</b><ul>${
    dubbi.map((p) => `<li>${esc(p.nome)}: ${esc(p.nota)}</li>`).join('')}</ul></div>` : '';
  const quando = [fmtData(evento.data), evento.cliente, [evento.ospiti ? `${evento.ospiti} adulti` : '', evento.bambini ? `${evento.bambini} bambini` : '']
    .filter(Boolean).join(' e ')].filter(Boolean).join(' · ');
  const corpo = `
    <style>
      @page { size: A4 landscape; margin: 10mm; }
      th.rot { height: 124px; vertical-align: bottom; padding: 4px 2px; width: 38px; }
      th.rot div { writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; font-size: 11px; margin: 0 auto; }
      td.c { text-align: center; font-size: 15px; color: #B03A2E; }
      td.piatto { font-weight: 700; font-size: 12px; }
      td.sez { background: #f4f4f0; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; }
      td.manca { text-align: center; font-style: italic; color: #9A5B00; }
      .avviso { margin-top: 12px; border: 2px solid #C77A12; padding: 6px 10px; font-size: 11px; }
      .legale { margin-top: 10px; font-size: 11px; }
    </style>
    <table><thead><tr><th>Portata</th>${intest}</tr></thead>
    <tbody>${corpoRighe || `<tr><td colspan="${ALLERGENI.length + 1}">Nessuna portata nel menù</td></tr>`}</tbody></table>
    <div class="legale">● = contiene l'allergene o suoi derivati (Reg. UE 1169/2011, allegato II).${dubbi.some((p) => p.stato === 'verifica') ? ' * = da verificare, vedi sotto.' : ''}
      Le preparazioni possono contenere tracce di altri allergeni per contaminazione crociata: chiedere sempre al personale.</div>
    ${avvisi}`;
  return wrapDoc(`Allergeni del menù — ${evento.titolo}`, corpo, imp, quando);
}

/* ---------- registri (corpo HTML, riusati nei singoli PDF e nel pacchetto ASL) ---------- */

/**
 * Registro temperature. Le note riportano correzioni e inserimenti in ritardo;
 * giorniMancanti ([{ giorno, mancanti, totali }]) elenca i giorni senza rilevazioni complete.
 */
export const corpoTemperature = (righe, giorniMancanti = []) => `<table><thead><tr>
  <th>Data e ora</th><th>Punto</th><th>Limiti</th><th>Rilevata</th><th>Esito</th><th>Note</th></tr></thead><tbody>
  ${righe.map((r) => `<tr>
    <td>${r.note && String(r.note).includes('in ritardo') ? fmtData(String(r.data_ora).length > 10 ? isoGiorno(r.data_ora) : r.data_ora) : fmtDataOra(r.data_ora)}</td><td>${esc(r.nome)}</td>
    <td>${esc(r.temp_min)}/${esc(r.temp_max)} °C</td>
    <td>${num(r.temperatura)} °C</td>
    <td class="${r.esito === 'conforme' ? 'ok' : 'nc'}">${esc(r.esito)}</td>
    <td>${esc(r.note)}</td></tr>`).join('')
  || '<tr><td colspan="6">Nessuna rilevazione nel periodo</td></tr>'}
  </tbody></table>
  ${giorniMancanti.length ? `<div class="avvisoGiorni"><b>Giorni senza rilevazioni complete (${giorniMancanti.length}):</b>
    ${giorniMancanti.map((g) => `${fmtData(g.giorno)}${g.mancanti < g.totali ? ` (${g.mancanti} su ${g.totali} mancanti)` : ''}`).join(', ')}</div>` : ''}`;

const isoGiorno = (istante) => {
  const d = new Date(istante);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Registro produzioni: per ogni piatto i lotti di materia prima impiegati (rintracciabilità a valle). */
export const corpoProduzioni = (righe) => `<table><thead><tr>
  <th>Data e ora</th><th>Piatto</th><th>Lotto prod.</th><th>Q.tà</th><th>Scad.</th><th>Allergeni</th><th>Ingredienti e lotti impiegati</th></tr></thead><tbody>
  ${righe.map((r) => {
    let allergeni = [];
    try { allergeni = JSON.parse(r.allergeni || '[]'); } catch (e) { allergeni = []; }
    return `<tr>
    <td>${fmtDataOra(r.data_ora)}</td><td>${esc(r.nome)}</td>
    <td>${esc(r.lotto_produzione) || '—'}</td><td>${num(r.quantita_prodotta) || '—'}</td>
    <td>${r.data_scadenza ? fmtData(r.data_scadenza) : '—'}</td>
    <td>${esc(allergeni.join(', ')) || '—'}</td>
    <td>${(r.lotti || []).map((l) => `${esc(l.prodotto)}: ${num(l.quantita_usata)} ${esc(l.unita_misura)}, lotto ${esc(l.numero_lotto) || '—'} (${esc(l.fornitore)})`).join('<br>') || '—'}</td></tr>`;
  }).join('')
  || '<tr><td colspan="7">Nessuna produzione nel periodo</td></tr>'}
  </tbody></table>`;

export const corpoCarichi = (righe) => `<table><thead><tr>
  <th>Data</th><th>Prodotto</th><th>Fornitore</th><th>Lotto</th><th>DDT</th>
  <th>Q.tà</th><th>Scad.</th><th>Temp.</th><th>Esito</th></tr></thead><tbody>
  ${righe.map((r) => `<tr>
    <td>${fmtData(r.data_ricevimento)}</td><td>${esc(r.prodotto)}</td>
    <td>${esc(r.fornitore)}</td><td>${esc(r.numero_lotto)}</td><td>${esc(r.ddt_numero)}</td>
    <td>${esc(r.quantita_iniziale)} ${esc(r.unita_misura)}${r.colli ? ` (${esc(r.colli)} colli)` : ''}</td>
    <td>${fmtData(r.data_scadenza)}</td>
    <td>${r.temperatura_rilevata === null || r.temperatura_rilevata === undefined ? '—' : `${esc(r.temperatura_rilevata)} °C`}</td>
    <td class="${r.esito_controllo === 'conforme' ? 'ok' : 'nc'}">${esc(r.esito_controllo)}</td></tr>`).join('')
  || '<tr><td colspan="9">Nessun carico nel periodo</td></tr>'}
  </tbody></table>`;

export const corpoSanificazione = (righe) => `<table><thead><tr>
  <th>Data e ora</th><th>Area</th><th>Prodotto</th><th>Operatore</th><th>Esito</th></tr></thead><tbody>
  ${righe.map((r) => `<tr>
    <td>${fmtDataOra(r.data_ora)}</td><td>${esc(r.nome) || '—'}</td>
    <td>${esc(r.prodotto_utilizzato) || '—'}</td><td>${esc(r.operatore) || '—'}</td>
    <td class="${r.esito === 'conforme' ? 'ok' : 'nc'}">${esc(r.esito)}</td></tr>`).join('')
  || '<tr><td colspan="5">Nessuna sanificazione nel periodo</td></tr>'}
  </tbody></table>`;

export const corpoNonConformita = (righe) => `<table><thead><tr>
  <th>Data</th><th>Origine</th><th>Descrizione</th><th>Azione correttiva</th><th>Stato</th></tr></thead><tbody>
  ${righe.map((r) => `<tr>
    <td>${fmtDataOra(r.data_ora)}</td><td>${esc(r.origine)}</td>
    <td>${esc(r.descrizione)}</td><td>${esc(r.azione_correttiva) || '—'}</td>
    <td class="${r.stato === 'aperta' ? 'nc' : 'ok'}">${esc(r.stato)}</td></tr>`).join('')
  || '<tr><td colspan="5">Nessuna non conformità</td></tr>'}
  </tbody></table>`;

/**
 * Pacchetto per il controllo: tutti i registri del periodo in un unico PDF,
 * ogni registro su una pagina nuova, con un indice in apertura.
 */
export function htmlPacchettoASL({ temperature, carichi, sanificazioni, nonConformita, piatti, produzioni = [], giorniMancanti = [] }, imp = {}, periodoTxt = '') {
  const nc = nonConformita.filter((r) => r.stato === 'aperta').length;
  const sezioni = [
    ['Registro temperature', corpoTemperature(temperature, giorniMancanti), `${temperature.length} rilevazioni${giorniMancanti.length ? `, ${giorniMancanti.length} giorni incompleti` : ''}`],
    ['Registro carichi merce', corpoCarichi(carichi), `${carichi.length} carichi`],
    ['Registro produzioni e lotti impiegati', corpoProduzioni(produzioni), `${produzioni.length} produzioni`],
    ['Registro sanificazione', corpoSanificazione(sanificazioni), `${sanificazioni.length} pulizie`],
    ['Registro non conformità', corpoNonConformita(nonConformita), `${nonConformita.length} registrate, ${nc} aperte`],
    ['Allergeni dei piatti', piatti.length ? corpoTabellaAllergeni(piatti) : '<p>Nessuna ricetta registrata.</p>', `${piatti.length} piatti`],
  ];
  const indice = `<h1>Contenuto</h1><table><tbody>${sezioni.map(([t, , n], i) =>
    `<tr><td>${i + 1}. ${esc(t)}</td><td>${esc(n)}</td></tr>`).join('')}</tbody></table>`;
  const corpo = indice + sezioni.map(([t, c]) =>
    `<div style="page-break-before: always"></div><h1>${esc(t)}</h1>${c}`).join('');
  return wrapDoc('Documentazione autocontrollo HACCP', corpo, imp, periodoTxt);
}

/**
 * Disposizione dei tavoli per i camerieri: la pianta di ogni sala usata (vista dall'alto, in scala, con porte e pilastri)
 * e l'elenco delle tavolate con la lunghezza da preparare. sale = [{ sala, piano }] (vedi sale.js).
 */
export function htmlDisposizioneSale({ data, servizio, sale = [] }, imp = {}) {
  const PX = 46; // punti per metro nella pianta
  const m = (n) => `${num(Math.round(n * 10) / 10)} m`;
  const blocchi = sale.map(({ sala, piano }) => ({ sala, d: disponi(sala, piano) })).filter((b) => b.d.tavolate.length > 0 || b.d.problemi.length > 0);
  const corpo = blocchi.map(({ sala, d }) => {
    const w = Math.max(...sala.contorno.map((p) => p[0])), h = Math.max(...sala.contorno.map((p) => p[1]));
    const muri = `<polygon points="${sala.contorno.map((p) => `${p[0] * PX},${p[1] * PX}`).join(' ')}" fill="#F7F5EC" stroke="#222" stroke-width="3"/>`;
    const ostacoli = sala.ostacoli.map((o) => `<rect x="${o.x * PX}" y="${o.y * PX}" width="${o.w * PX}" height="${o.h * PX}" fill="#9a9a92"/>`).join('');
    const porte = sala.porte.map((p) => {
      const vert = p.x1 === p.x2, mx = (p.x1 + p.x2) / 2 * PX, my = (p.y1 + p.y2) / 2 * PX;
      const dentroX = vert ? (p.x1 > w / 2 ? -1 : 1) : 0, dentroY = vert ? 0 : (p.y1 > h / 2 ? -1 : 1);
      return `<line x1="${p.x1 * PX}" y1="${p.y1 * PX}" x2="${p.x2 * PX}" y2="${p.y2 * PX}" stroke="#F7F5EC" stroke-width="5"/>
        <line x1="${p.x1 * PX}" y1="${p.y1 * PX}" x2="${p.x2 * PX}" y2="${p.y2 * PX}" stroke="#9C4524" stroke-width="2.5" stroke-dasharray="5 3"/>
        <text x="${mx + dentroX * 8}" y="${my + dentroY * 13 + 3}" text-anchor="${vert ? (dentroX > 0 ? 'start' : 'end') : 'middle'}" font-size="9" fill="#9C4524" font-weight="700">${esc(p.nome)}</text>`;
    }).join('');
    const tavoli = d.tavolate.map((t) => {
      const lw = (t.asse === 'x' ? t.len : LARGO_TAVOLO) * PX, lh = (t.asse === 'x' ? LARGO_TAVOLO : t.len) * PX, x = t.x * PX - lw / 2, y = t.y * PX - lh / 2;
      const chi = t.prenotata ? `${t.numeroPersone || '?'} pers.` : 'libera';
      const nome = t.nome.trim().slice(0, 16);
      const testi = t.asse === 'x'
        ? `<text x="${t.x * PX}" y="${t.y * PX - 3}" text-anchor="middle" font-size="12" font-weight="700">${esc(t.sigla)}${nome ? ` ${esc(nome)}` : ''}</text>
           <text x="${t.x * PX}" y="${t.y * PX + 10}" text-anchor="middle" font-size="9">${esc(chi)} · ${m(t.len)}</text>`
        : `<g transform="rotate(-90 ${t.x * PX} ${t.y * PX})"><text x="${t.x * PX}" y="${t.y * PX - 3}" text-anchor="middle" font-size="12" font-weight="700">${esc(t.sigla)}${nome ? ` ${esc(nome)}` : ''}</text>
           <text x="${t.x * PX}" y="${t.y * PX + 10}" text-anchor="middle" font-size="9">${esc(chi)} · ${m(t.len)}</text></g>`;
      return `<rect x="${x}" y="${y}" width="${lw}" height="${lh}" rx="3" fill="${t.prenotata ? '#DCEBD2' : '#fff'}" stroke="${t.troppi ? '#C0392B' : '#222'}" stroke-width="${t.troppi ? 2.5 : 1.3}"/>${testi}`;
    }).join('');
    const tot = d.tavolate.reduce((s, t) => ({ posti: s.posti + t.posti, persone: s.persone + t.numeroPersone, metri: s.metri + t.len }), { posti: 0, persone: 0, metri: 0 });
    const righe = d.tavolate.map((t) => `<tr><td><b>${esc(t.sigla)}</b></td><td>${esc(sala.file[t.fila].nome)}</td><td>${m(t.len)}</td>
      <td>${t.posti}</td><td>${esc(t.nome)}</td><td${t.troppi ? ' class="nc"' : ''}>${t.numeroPersone || ''}</td><td>${esc(t.ora)}</td><td>${esc(t.note)}</td></tr>`).join('');
    return `<div class="sala"><h2>${esc(sala.nome)}</h2>
      <div class="kv">${d.tavolate.length} tavolate · ${tot.persone} persone · ${tot.posti} posti · ${m(tot.metri)} di tavoli da preparare</div>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="-8 -8 ${w * PX + 16} ${h * PX + 16}" style="width:${Math.min(100, Math.round(w / 16 * 100))}%;max-height:${w > h ? 95 : 120}mm;display:block;margin:6px auto 8px">
        ${muri}${ostacoli}${tavoli}${porte}</svg>
      <table><thead><tr><th>Tavolo</th><th>Fila</th><th>Lunghezza</th><th>Posti</th><th>Prenotazione</th><th>Persone</th><th>Ora</th><th>Note</th></tr></thead><tbody>${righe}</tbody></table>
      ${d.problemi.length ? `<div class="avvisoGiorni"><b>Da controllare:</b> ${d.problemi.map(esc).join(' · ')}</div>` : ''}</div>`;
  }).join('');
  const stile = '<style>.sala{page-break-inside:avoid;margin-bottom:14px} h2{font-size:15px;margin:10px 0 2px} .firma{display:none}</style>';
  return wrapDoc('Disposizione dei tavoli', stile + (corpo || '<p>Nessuna tavolata.</p>'), imp, `${fmtData(data)} · ${servizio}`);
}

export { esc, fmtData, fmtDataOra };
