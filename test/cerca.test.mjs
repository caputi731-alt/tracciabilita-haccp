import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  prodottiConGiacenza, portateDelMenu, cercaTutto, leggiRecenti, aggiungiRecente, vociRecenti, MAX_RECENTI,
} from '../cerca.js';

// dati inventati
const PRODOTTI = [
  { id: 1, denominazione: 'Burrata', categoria: 'Latticini', conservazione: 'refrigerato', fornitore: 'Caseificio Prova' },
  { id: 2, denominazione: 'Semola rimacinata', categoria: 'Secco/Dispensa', conservazione: 'ambiente', fornitore: '' },
  { id: 3, denominazione: 'Olio extravergine', categoria: 'Secco/Dispensa', conservazione: 'ambiente', fornitore: '' },
];
const LOTTI = [
  { id: 10, prodotto_id: 1, prodotto: 'Burrata', numero_lotto: 'BU-2210', quantita_residua: 1.5, unita_misura: 'kg',
    data_scadenza: '2026-10-25', stato: 'disponibile', fornitore: 'Caseificio Prova' },
  { id: 11, prodotto_id: 1, prodotto: 'Burrata', numero_lotto: 'BU-2105', quantita_residua: 1, unita_misura: 'kg',
    data_scadenza: '2026-10-21', stato: 'disponibile', fornitore: 'Caseificio Prova' },
  { id: 12, prodotto_id: 2, prodotto: 'Semola rimacinata', numero_lotto: 'L2309', quantita_residua: 6, unita_misura: 'kg',
    data_scadenza: '2027-01-18', stato: 'disponibile', fornitore: 'Molino Esempio' },
  { id: 13, prodotto_id: 2, prodotto: 'Semola rimacinata', numero_lotto: 'L0001', quantita_residua: 3, unita_misura: 'kg',
    data_scadenza: '2027-02-01', stato: 'bloccato', fornitore: 'Molino Esempio' },
];
const MENU = JSON.stringify({ dishes: [
  { id: 'd1', name: 'Burrata  con pomodorini', cat: 'Antipasti', rid: 7 },
  { id: 'd2', name: 'Orecchiette alle cime di rapa', cat: 'Primi' },
  null, { id: 'd3' },
] });
const RICETTE = [{ id: 7, nome: 'Burrata con pomodorini', categoria: 'Antipasti' }, { id: 8, nome: 'Ragù', categoria: '' }];

test('giacenza: lotti disponibili sommati per prodotto, il primo a scadere davanti', () => {
  const g = prodottiConGiacenza(PRODOTTI, LOTTI);
  const burrata = g.find((p) => p.id === 1);
  assert.equal(burrata.totale, 2.5);
  assert.equal(burrata.unita, 'kg');
  assert.equal(burrata.scadenza, '2026-10-21');
  assert.equal(burrata.lotti.length, 2);
  // il lotto bloccato non conta
  assert.equal(g.find((p) => p.id === 2).totale, 6);
  // prodotto senza lotti: c'è, con giacenza zero
  const olio = g.find((p) => p.id === 3);
  assert.equal(olio.totale, 0);
  assert.equal(olio.lotti.length, 0);
});

test('portate del Menù: lette dallo stato, spazi sistemati, righe rotte ignorate', () => {
  const p = portateDelMenu(MENU);
  assert.deepEqual(p.map((d) => d.nome), ['Burrata con pomodorini', 'Orecchiette alle cime di rapa']);
  assert.equal(p[0].ricettaId, 7);
  assert.deepEqual(portateDelMenu('non è json'), []);
  assert.deepEqual(portateDelMenu(null), []);
});

test('ricerca: trova prodotto, ricetta, portata e sezione insieme', () => {
  const dati = { prodotti: prodottiConGiacenza(PRODOTTI, LOTTI), ricette: RICETTE, portate: portateDelMenu(MENU) };
  const r = cercaTutto('burr', dati);
  assert.deepEqual(r.prodotti.map((p) => p.nome), ['Burrata']);
  assert.deepEqual(r.ricette.map((p) => p.id), [7]);
  assert.deepEqual(r.portate.map((p) => p.id), ['d1']);
  assert.equal(r.totale, 3);
  assert.equal(r.prodotti[0].lottoTrovato, null);
});

test('ricerca: senza accenti, per numero di lotto e per fornitore', () => {
  const dati = { prodotti: prodottiConGiacenza(PRODOTTI, LOTTI) };
  const lotto = cercaTutto('bu-2105', dati);
  assert.equal(lotto.prodotti[0].nome, 'Burrata');
  assert.equal(lotto.prodotti[0].lottoTrovato.id, 11);
  assert.equal(cercaTutto('molino', dati).prodotti[0].nome, 'Semola rimacinata');
  assert.equal(cercaTutto('SÈMOLA', dati).prodotti.length, 1);
});

test('ricerca: le sezioni si trovano anche per sinonimo; testo vuoto = niente', () => {
  const r = cercaTutto('frigo', {});
  assert.ok(r.sezioni.some((s) => s.id === 'temperature'));
  assert.equal(cercaTutto('   ', { prodotti: prodottiConGiacenza(PRODOTTI, LOTTI) }).totale, 0);
  assert.equal(cercaTutto('zzzz', { prodotti: prodottiConGiacenza(PRODOTTI, LOTTI) }).totale, 0);
});

test('usate di recente: in cima l\'ultima, senza doppi, al massimo cinque', () => {
  let l = leggiRecenti('rotto');
  assert.deepEqual(l, []);
  for (const id of ['temperature', 'magazzino', 'temperature', 'inesistente', 'etichette', 'carico', 'eventi', 'giro']) {
    l = aggiungiRecente(l, id);
  }
  assert.equal(l.length, MAX_RECENTI);
  assert.equal(l[0], 'giro');
  assert.ok(!l.includes('inesistente'));
  assert.deepEqual(leggiRecenti(JSON.stringify(['magazzino', 'magazzino', 'boh', 5])), ['magazzino']);
  assert.equal(vociRecenti(['magazzino'])[0].titolo, 'Magazzino');
});
