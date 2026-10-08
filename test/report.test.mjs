import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlTabellaAllergeni } from '../report.js';

test('tabella allergeni: pallini, escape e avvisi per ingredienti non verificati', () => {
  const html = htmlTabellaAllergeni([
    { nome: 'Tagliatelle <al ragù>', categoria: 'Primi', allergeni: ['Glutine', 'Uova'], daVerificare: [], senzaIngredienti: false },
    { nome: 'Tiramisù', categoria: 'Dolci', allergeni: ['Latte'], daVerificare: ['Mascarpone'], senzaIngredienti: false },
  ], { nome_attivita: 'Ristorante di prova' });
  assert.ok(html.includes('Tagliatelle &lt;al ragù&gt;'), 'i nomi vanno messi in sicurezza per l’HTML');
  assert.equal((html.match(/●<\/td>/g) || []).length, 3);
  assert.match(html, /allergeni non confermati per Mascarpone/);
  assert.match(html, /A4 landscape/);
  assert.match(html, /Ristorante di prova/);
});

test('pacchetto ASL: indice, una pagina per registro, righe vuote spiegate', async () => {
  const { htmlPacchettoASL } = await import('../report.js');
  const html = htmlPacchettoASL({
    temperature: [{ data_ora: '2026-09-15T08:00:00', nome: 'Frigo 1', temp_min: 0, temp_max: 4, temperatura: 3, esito: 'conforme' }],
    carichi: [],
    sanificazioni: [],
    nonConformita: [{ data_ora: '2026-09-10T10:00:00', origine: 'temperatura', descrizione: 'Frigo caldo', stato: 'aperta' }],
    piatti: [{ nome: 'Tiramisù', allergeni: ['Latte', 'Uova'], daVerificare: [], senzaIngredienti: false }],
  }, { nome_attivita: 'Ristorante di prova' }, 'Periodo: 01/09/2026 — 15/09/2026');
  assert.match(html, /Documentazione autocontrollo HACCP/);
  assert.match(html, /1 rilevazioni/);
  assert.match(html, /1 registrate, 1 aperte/);
  assert.equal((html.match(/page-break-before: always/g) || []).length, 6);
  assert.match(html, /Nessuna produzione nel periodo/);
  assert.match(html, /Nessun carico nel periodo/);
  assert.match(html, /Tiramisù/);
});

test('registri: note e giorni mancanti nelle temperature, lotti impiegati nelle produzioni', async () => {
  const { corpoTemperature, corpoProduzioni } = await import('../report.js');
  const t = corpoTemperature(
    [{ data_ora: '2026-09-15T08:00:00', nome: 'Frigo <1>', temp_min: 0, temp_max: 4, temperatura: 3.5, esito: 'conforme', note: 'Corretto il 15/09/2026: era 9°C' }],
    [{ giorno: '2026-09-14', mancanti: 2, totali: 2 }, { giorno: '2026-09-13', mancanti: 1, totali: 2 }]);
  assert.match(t, /Frigo &lt;1&gt;/);
  assert.match(t, /3,5 °C/);
  assert.match(t, /era 9°C/);
  assert.match(t, /Giorni senza rilevazioni complete \(2\)/);
  assert.match(t, /1 su 2 mancanti/);
  const p = corpoProduzioni([{ data_ora: '2026-09-15T08:00:00', nome: 'Ragù', lotto_produzione: 'P1', quantita_prodotta: 2.5,
    allergeni: '["Sedano"]', lotti: [{ prodotto: 'Macinato', quantita_usata: 1.2, unita_misura: 'kg', numero_lotto: 'L9', fornitore: 'Macelleria & C.' }] }]);
  assert.match(p, /Macinato: 1,2 kg, lotto L9 \(Macelleria &amp; C\.\)/);
  assert.match(p, /Sedano/);
});

test('disposizione dei tavoli per i camerieri: pianta, elenco, nomi in sicurezza, avvisi', async () => {
  const { htmlDisposizioneSale } = await import('../report.js');
  const { SALE } = await import('../sale.js');
  const t = (id, persone, nome = '', ora = '', len = null) => ({ id, nome, persone: String(persone || ''), ora, note: '', len });
  const html = htmlDisposizioneSale({ data: '2026-10-11', servizio: 'Pranzo', sale: [
    { sala: SALE.stalla, piano: { file: [[t('a', 10, 'Rossi <b>', '13:00'), t('b', 4, 'Bianchi', '', 0.9)], [t('c', 0, '', '', 1.8)]] } },
    { sala: SALE.panoramica, piano: { file: [[], []] } },
  ] }, { nome_attivita: 'Ristorante di prova' });
  assert.match(html, /Disposizione dei tavoli/);
  assert.match(html, /11\/10\/2026 · Pranzo/);
  assert.ok(html.includes('Rossi &lt;b&gt;') && !html.includes('Rossi <b>'));
  assert.equal((html.match(/<rect [^>]*rx="3"/g) || []).length, 3);        // tre tavolate
  assert.equal((html.match(/<polygon /g) || []).length, 1);
  assert.match(html, /Sala antica stalla/);
  assert.ok(!html.includes('Sala panoramica'), 'una sala senza tavoli non si stampa');
  assert.match(html, /3 tavolate · 14 persone · 19 posti · 5,9 m di tavoli da preparare/);
  assert.match(html, /Ingresso/);
  assert.match(html, /S2 Bianchi: 4 persone su 3 posti/);
});
