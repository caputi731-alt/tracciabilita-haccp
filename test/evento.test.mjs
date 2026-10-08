import { test } from 'node:test';
import assert from 'node:assert/strict';
import { converti, porzioniEvento, fabbisogno, costi, testoOrdine } from '../evento.js';

const prodotti = () => new Map([
  [1, { id: 1, denominazione: 'Semola', unita_misura: 'kg', giacenza: 6, prezzo: 1.2, fornitore: 'Molino' }],
  [2, { id: 2, denominazione: 'Cime di rapa', unita_misura: 'kg', giacenza: 2, prezzo: 3, fornitore: 'Ortofrutta' }],
  [3, { id: 3, denominazione: 'Olio', unita_misura: 'l', giacenza: 10, prezzo: 9, fornitore: '' }],
  [4, { id: 4, denominazione: 'Uova', unita_misura: 'pz', giacenza: 0, prezzo: null, fornitore: 'Ortofrutta' }],
  [5, { id: 5, denominazione: 'Agnello', unita_misura: 'kg', giacenza: 0, prezzo: 14, fornitore: 'Macelleria' }],
]);
const ricette = () => new Map([
  [10, { id: 10, nome: 'Orecchiette', porzioni: 10, ingredienti: [
    { prodotto_id: 1, quantita: 1, unita_misura: 'kg' }, { prodotto_id: 2, quantita: 1500, unita_misura: 'g' }, { prodotto_id: 3, quantita: 100, unita_misura: 'ml' }] }],
  [11, { id: 11, nome: 'Agnello al forno', porzioni: 4, ingredienti: [{ prodotto_id: 5, quantita: 1.2, unita_misura: 'kg' }] }],
  [12, { id: 12, nome: 'Frittata', porzioni: 2, ingredienti: [{ prodotto_id: 4, quantita: 4, unita_misura: 'pz' }, { prodotto_id: 1, quantita: 1, unita_misura: 'pz' }] }],
  [13, { id: 13, nome: 'Senza porzioni', porzioni: null, ingredienti: [{ prodotto_id: 1, quantita: 1, unita_misura: 'kg' }] }],
  [14, { id: 14, nome: 'Vuota', porzioni: 4, ingredienti: [] }],
]);
const evento = (extra = {}) => ({
  id: 'e', data: '2026-10-17', titolo: 'Battesimo', cliente: 'Rossi', ospiti: 40, bambini: 10, prezzoAdulti: 44, prezzoBambini: 22,
  portate: [{ nome: 'Orecchiette', ricettaId: 10, bambini: false }, { nome: 'Agnello', ricettaId: 11, bambini: false }], ...extra,
});

test('conversioni fra unità', () => {
  assert.equal(converti(1500, 'g', 'kg'), 1.5);
  assert.equal(converti(2, 'kg', 'g'), 2000);
  assert.equal(converti(250, 'ml', 'l'), 0.25);
  assert.equal(converti(3, 'pz', 'pz'), 3);
  assert.equal(converti(3, 'KG', 'kg'), 3);
  assert.equal(converti(1, 'kg', 'l'), null);
  assert.equal(converti(1, 'pz', 'kg'), null);
  assert.equal(converti('x', 'kg', 'kg'), null);
});

test('porzioni: senza menù bambini i bambini contano come adulti', () => {
  assert.deepEqual(porzioniEvento(evento()).map((p) => p.porzioni), [50, 50]);
  const conBimbi = evento({ portate: [{ nome: 'Orecchiette', ricettaId: 10, bambini: false }, { nome: 'Cotoletta', ricettaId: null, bambini: true }] });
  assert.deepEqual(porzioniEvento(conBimbi).map((p) => p.porzioni), [40, 10]);
});

test('fabbisogno: quantità in proporzione agli ospiti, giacenza scalata, ordine per fornitore', () => {
  const f = fabbisogno(evento(), ricette(), prodotti());
  assert.equal(f.incompleto, false);
  // 50 porzioni: semola 1 kg ogni 10 → 5 kg; cime 1,5 kg ogni 10 → 7,5 kg; olio 0,1 l ogni 10 → 0,5 l; agnello 1,2 kg ogni 4 → 15 kg
  assert.deepEqual(f.righe.map((r) => [r.nome, r.serve, r.giacenza, r.manca, r.unita]), [
    ['Agnello', 15, 0, 15, 'kg'], ['Cime di rapa', 7.5, 2, 5.5, 'kg'], ['Olio', 0.5, 10, 0, 'l'], ['Semola', 5, 6, 0, 'kg'],
  ]);
  assert.deepEqual(f.daOrdinare.map((g) => [g.fornitore, g.righe.map((r) => r.nome)]), [['Macelleria', ['Agnello']], ['Ortofrutta', ['Cime di rapa']]]);
  const testo = testoOrdine(evento(), f);
  assert.match(testo, /Da ordinare per Battesimo \(Rossi\) del 17\/10\/2026/);
  assert.match(testo, /Macelleria:\n- Agnello: 15 kg/);
  assert.match(testo, /- Cime di rapa: 5,5 kg/);
  assert.ok(!testo.includes('Semola') && !testo.includes('Attenzione'));
});

test('fabbisogno: quello che non si può calcolare viene elencato, non stimato', () => {
  const e = evento({ portate: [
    { nome: 'Orecchiette', ricettaId: 10, bambini: false }, { nome: 'Libera', ricettaId: null, bambini: false },
    { nome: 'Sparita', ricettaId: 99, bambini: false }, { nome: 'Frittata', ricettaId: 12, bambini: false },
    { nome: 'Senza porzioni', ricettaId: 13, bambini: false }, { nome: 'Vuota', ricettaId: 14, bambini: false }] });
  const f = fabbisogno(e, ricette(), prodotti());
  assert.equal(f.incompleto, true);
  const p = Object.fromEntries(f.portate.map((x) => [x.nome, x.problemi]));
  assert.deepEqual(p.Orecchiette, []);
  assert.match(p.Libera[0], /non è collegata/);
  assert.match(p.Sparita[0], /non esiste più/);
  assert.deepEqual(p.Frittata, ['Semola: la ricetta è in pz, il magazzino in kg']);
  assert.match(p['Senza porzioni'][0], /numero di porzioni/);
  assert.match(p.Vuota[0], /non ha ingredienti/);
  // le uova della frittata (stessa unità) entrano comunque: 4 ogni 2 porzioni × 50
  assert.deepEqual(f.righe.find((r) => r.nome === 'Uova'), { prodottoId: 4, nome: 'Uova', unita: 'pz', serve: 100, giacenza: 0, manca: 100, fornitore: 'Ortofrutta' });
  assert.match(testoOrdine(e, f), /Attenzione: alcune portate non sono nel conto/);
  const vuoto = fabbisogno(evento({ portate: [] }), ricette(), prodotti());
  assert.deepEqual([vuoto.righe, vuoto.daOrdinare, vuoto.incompleto], [[], [], false]);
  assert.match(testoOrdine(evento(), vuoto), /Niente da ordinare/);
});

test('costo e margine: costo a porzione, ricavo al netto dell\'IVA, incidenza', () => {
  const c = costi(evento(), ricette(), prodotti());
  // orecchiette: (1×1,2 + 1,5×3 + 0,1×9) / 10 = 0,66 ; agnello: 1,2×14 / 4 = 4,20
  assert.deepEqual(c.portate.map((p) => [p.nome, p.costo, p.problemi.length]), [['Orecchiette', 0.66, 0], ['Agnello', 4.2, 0]]);
  assert.equal(c.costoAdulto, 4.86);
  assert.equal(c.costoBambino, 4.86, 'senza menù bambini il bambino costa come un adulto');
  assert.equal(c.costoTotale, 243);
  assert.equal(c.ricavo, 40 * 44 + 10 * 22);
  assert.equal(c.ricavoNetto, 1800);
  assert.equal(c.margine, 1557);
  assert.ok(Math.abs(c.incidenza - 0.135) < 1e-9);
  assert.equal(c.incompleto, false);
});

test('costo: prezzi o ricette mancanti segnalati; senza prezzo a persona niente margine', () => {
  const e = evento({ prezzoAdulti: null, prezzoBambini: null, portate: [
    { nome: 'Frittata', ricettaId: 12, bambini: false }, { nome: 'Libera', ricettaId: null, bambini: false },
    { nome: 'Agnello piccolo', ricettaId: 11, bambini: true }] });
  const c = costi(e, ricette(), prodotti());
  assert.equal(c.incompleto, true);
  assert.deepEqual(c.portate[0].problemi, ['Semola: la ricetta è in pz, il magazzino in kg', 'Uova non ha un prezzo d\'acquisto']);
  assert.equal(c.portate[0].costo, 0);
  assert.equal(c.costoAdulto, 0);
  assert.equal(c.costoBambino, 4.2, 'con il menù bambini il costo del bambino è quello delle sue portate');
  assert.deepEqual([c.ricavo, c.margine, c.incidenza], [null, null, null]);
  const soloAdulti = costi(evento({ prezzoBambini: null }), ricette(), prodotti());
  assert.equal(soloAdulti.bambiniSenzaPrezzo, true);
  assert.equal(soloAdulti.ricavo, 1760);
});

test('allergeni dell\'evento: dalla ricetta se collegata, altrimenti a mano; mai "nessuno" se non si sa', async () => {
  const { allergeniEvento } = await import('../evento.js');
  const { eventiMenu } = await import('../menuPonte.js');
  const { htmlSchedaAllergeniEvento } = await import('../report.js');
  const stato = JSON.stringify({
    dishes: [{ id: 'a', name: 'Orecchiette', rid: 1, alg: [9] }, { id: 'b', name: 'Agnello', alg: [], algSet: true }, { id: 'c', name: 'Torta', alg: [1, 3, 7] },
      { id: 'd', name: 'Mai indicata' }, { id: 'e', name: 'Ricetta vuota', rid: 2 }, { id: 'f', name: 'Con dubbio', rid: 3 }],
    menus: [{ id: 'm', date: '2026-10-17', heading: 'Battesimo <Rossi>', guests: 40, sections: [{ name: 'Primi', items: [
      { dishId: 'a', name: 'Orecchiette' }, { dishId: 'b', name: 'Agnello' }, { dishId: 'c', name: 'Torta senza uova' },
      { dishId: 'c', name: 'Torta speciale', alg: [1, 8] }, { dishId: 'd', name: 'Mai indicata' }, { name: 'Fuori archivio' },
      { dishId: 'e', name: 'Ricetta vuota' }, { dishId: 'f', name: 'Con dubbio' }] }] }],
  });
  const ricette = new Map([
    [1, { id: 1, nome: 'Orecchiette', ingredienti: 2, allergeni: [1, 4], daVerificare: [] }],
    [2, { id: 2, nome: 'Vuota', ingredienti: 0, allergeni: [], daVerificare: [] }],
    [3, { id: 3, nome: 'Dubbia', ingredienti: 1, allergeni: [1], daVerificare: ['Farina 00'] }],
  ]);
  const evento = eventiMenu(stato)[0];
  const r = allergeniEvento(evento, ricette);
  assert.deepEqual(r.map((x) => [x.nome, x.numeri, x.stato, x.fonte]), [
    ['Orecchiette', [1, 4], 'ok', 'ricetta'],        // la ricetta vince su quelli a mano
    ['Agnello', [], 'ok', 'a mano'],                 // "Nessuno" scelto a mano
    ['Torta senza uova', [1, 3, 7], 'verifica', 'a mano'], // testo cambiato: quelli dell'archivio vanno controllati
    ['Torta speciale', [1, 8], 'ok', 'a mano'],      // indicati su questa portata del menù
    ['Mai indicata', [], 'manca', 'a mano'],
    ['Fuori archivio', [], 'manca', 'a mano'],
    ['Ricetta vuota', [], 'manca', 'ricetta'],
    ['Con dubbio', [1], 'verifica', 'ricetta'],
  ]);
  assert.match(r[7].nota, /Farina 00/);
  // ricetta collegata ma non più esistente: valgono quelli a mano dell'archivio
  assert.deepEqual(allergeniEvento(evento, new Map())[0].numeri, [9]);
  const html = htmlSchedaAllergeniEvento(evento, r, { nome_attivita: 'Prova' });
  assert.ok(html.includes('Battesimo &lt;Rossi&gt;') && !html.includes('<Rossi>'));
  assert.equal((html.match(/Allergeni non indicati/g) || []).length, 3);
  assert.match(html, /Da completare prima di consegnare la scheda/);
  assert.ok(html.includes('1. Glutine') && html.includes('14. Molluschi'));
});
