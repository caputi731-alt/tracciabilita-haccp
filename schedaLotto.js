/** Scheda PDF di un lotto: rintracciabilità per l'ASL o rapporto di richiamo se il lotto è bloccato. */
import { fmtData, fmtDataOra } from './theme';
import { wrapDoc, stampa, esc } from './report';

export function htmlSchedaLotto({ lotto: l, movimenti = [], produzioni = [], impatto = null }, imp = {}) {
  let allerg = [];
  try { allerg = JSON.parse(l.allergeni || '[]'); } catch (e) { allerg = []; }

  const movRighe = movimenti.map((m) => `
    <tr><td>${fmtDataOra(m.data_ora)}</td><td>${esc(m.tipo)}</td>
    <td>${esc(m.quantita)} ${esc(l.unita_misura)}</td><td>${esc(m.causale)}</td></tr>`).join('');

  const prodRighe = produzioni.map((pr) => `
    <tr><td>${fmtDataOra(pr.data_ora)}</td><td>${esc(pr.nome)}</td>
    <td>${esc(pr.lotto_produzione) || '—'}</td><td>${esc(pr.quantita_usata)}</td></tr>`).join('');

  const stessa = impatto && impatto.stessaPartita.length ? `
    <h1 style="margin-top:16px">Altri carichi con lo stesso numero di lotto</h1>
    <table><thead><tr><th>Ricevuto</th><th>Fornitore</th><th>DDT</th><th>Residuo</th><th>Stato</th></tr></thead><tbody>
    ${impatto.stessaPartita.map((x) => `<tr><td>${fmtData(x.data_ricevimento)}</td><td>${esc(x.fornitore)}</td>
      <td>${esc(x.ddt_numero) || '—'}</td><td>${esc(x.quantita_residua)} ${esc(x.unita_misura)}</td>
      <td>${esc(x.stato)}</td></tr>`).join('')}</tbody></table>` : '';

  const corpo = `
    <div class="kv"><b>Prodotto:</b> ${esc(l.prodotto)}</div>
    <div class="kv"><b>Numero di lotto:</b> ${esc(l.numero_lotto) || '—'}</div>
    <div class="kv"><b>Fornitore:</b> ${esc(l.fornitore)}
      ${l.fornitore_piva ? '(P.IVA ' + esc(l.fornitore_piva) + ')' : ''}</div>
    <div class="kv"><b>Riconoscimento CE:</b> ${esc(l.numero_riconoscimento_ce) || '—'}</div>
    <div class="kv"><b>DDT / fattura:</b> ${esc(l.ddt_numero) || '—'} del ${fmtData(l.ddt_data)}</div>
    <div class="kv"><b>Ricevuto il:</b> ${fmtData(l.data_ricevimento)}</div>
    <div class="kv"><b>Quantità ricevuta:</b> ${esc(l.quantita_iniziale)} ${esc(l.unita_misura)}
      ${l.colli ? `(${esc(l.colli)} colli)` : ''}</div>
    <div class="kv"><b>Giacenza residua:</b> ${esc(l.quantita_residua)} ${esc(l.unita_misura)}</div>
    <div class="kv"><b>Scadenza / TMC:</b> ${fmtData(l.data_scadenza)}</div>
    <div class="kv"><b>Temperatura al ricevimento:</b> ${l.temperatura_rilevata ?? '—'} °C</div>
    <div class="kv"><b>Esito controllo:</b> ${esc(l.esito_controllo)}</div>
    <div class="kv"><b>Stato del lotto:</b> ${l.stato === 'bloccato' ? '<span class="nc">BLOCCATO</span>' : esc(l.stato)}</div>
    ${l.note ? `<div class="kv"><b>Annotazioni:</b> ${esc(l.note)}</div>` : ''}
    <div class="kv"><b>Allergeni:</b> ${allerg.length ? esc(allerg.join(', ')) : 'nessuno dichiarato'}</div>
    <h1 style="margin-top:16px">Movimenti del lotto</h1>
    <table><thead><tr><th>Data</th><th>Tipo</th><th>Quantità</th><th>Causale</th></tr></thead>
    <tbody>${movRighe || '<tr><td colspan="4">Nessun movimento</td></tr>'}</tbody></table>
    <h1 style="margin-top:16px">Impiego nei piatti (tracciabilità a valle)</h1>
    <table><thead><tr><th>Data</th><th>Piatto</th><th>Lotto produzione</th><th>Q.tà usata</th></tr></thead>
    <tbody>${prodRighe || '<tr><td colspan="4">Nessun impiego registrato</td></tr>'}</tbody></table>
    ${stessa}`;

  const titolo = `${l.stato === 'bloccato' ? 'Rapporto di richiamo' : 'Scheda di rintracciabilità'} — lotto ${l.numero_lotto || l.id}`;
  return wrapDoc(titolo, corpo, imp);
}

export const stampaSchedaLotto = (dati, imp) => stampa(htmlSchedaLotto(dati, imp));
