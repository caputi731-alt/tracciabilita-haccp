import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { estraiTestoPdf, base64ToBytes } from '../letturaPdf.js';
import { analizzaFattura, numeroIt, chiaveArticolo } from '../fattura.js';

const pdf = new Uint8Array(readFileSync(new URL('./fattura-esempio.pdf', import.meta.url)));

test('base64 → bytes identici', () => {
  const b64 = Buffer.from(pdf).toString('base64');
  assert.deepEqual(Buffer.from(base64ToBytes(b64)), Buffer.from(pdf));
});

test('numeri in formato italiano', () => {
  assert.equal(numeroIt('4,50'), 4.5);
  assert.equal(numeroIt('1.234,56'), 1234.56);
  assert.equal(numeroIt('20,300'), 20.3);
});

test('legge intestazione e righe della fattura di esempio', () => {
  const r = analizzaFattura(estraiTestoPdf(pdf), '10987654321');
  assert.equal(r.numero, '1234');
  assert.equal(r.data, '2026-09-15');
  assert.deepEqual(r.partiteIva, ['12345678901']); // la P.IVA del cliente è esclusa
  assert.equal(r.articoli.length, 4);
  assert.equal(r.quadra, true);

  const [peperoni, polpa, pelati, panna] = r.articoli;
  assert.deepEqual([peperoni.quantita, peperoni.unita_misura, peperoni.colli, peperoni.origine], [4.5, 'kg', 1, 'ITALIA']);
  assert.deepEqual([polpa.quantita, polpa.unita_misura, polpa.colli, polpa.lotto], [5.13, 'kg', 3, '2604840MM68756']);
  assert.deepEqual([pelati.quantita, pelati.unita_misura, pelati.um_fattura], [6, 'pz', 'PZ']);
  assert.deepEqual([panna.quantita, panna.colli, panna.confezione], [2, 2, 12]);
  assert.equal(chiaveArticolo(polpa), 'cod:1000002');
});
