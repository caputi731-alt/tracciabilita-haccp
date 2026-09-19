import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlSchedaLotto } from '../schedaLotto.js';

const lotto = {
  id: 3, prodotto: 'Polpa <bovino>', numero_lotto: 'M77', fornitore: 'Fornitore', unita_misura: 'kg',
  quantita_iniziale: 5, quantita_residua: 2, colli: 3, stato: 'bloccato', allergeni: '["Latte"]',
};

test('scheda lotto: titolo di richiamo, testi in sicurezza, sezioni sempre presenti', () => {
  const html = htmlSchedaLotto({
    lotto,
    movimenti: [{ data_ora: '2026-09-15T10:00:00', tipo: 'carico', quantita: 5, causale: null }],
    produzioni: [],
    impatto: { stessaPartita: [{ id: 4, data_ricevimento: '2026-09-01', fornitore: 'F', ddt_numero: '1', quantita_residua: 1, unita_misura: 'kg', stato: 'disponibile' }] },
  }, { nome_attivita: 'Ristorante' });
  assert.match(html, /Rapporto di richiamo — lotto M77/);
  assert.ok(html.includes('Polpa &lt;bovino&gt;'));
  assert.match(html, /BLOCCATO/);
  assert.match(html, /Nessun impiego registrato/);
  assert.match(html, /Altri carichi con lo stesso numero di lotto/);
  assert.match(html, /Latte/);
});

test('scheda lotto: senza allergeni e senza altri carichi', () => {
  const html = htmlSchedaLotto({ lotto: { ...lotto, stato: 'disponibile', allergeni: null } });
  assert.match(html, /Scheda di rintracciabilità/);
  assert.match(html, /nessuno dichiarato/);
  assert.ok(!html.includes('Altri carichi'));
});
