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
