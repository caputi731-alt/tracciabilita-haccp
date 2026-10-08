import { test } from 'node:test';
import assert from 'node:assert/strict';
import { passiGiro } from '../giro.js';

test('giro di controllo: solo quello che manca oggi, nell\'ordine temperature, pulizie, scadenze', () => {
  const passi = passiGiro({
    punti: [{ id: 1, nome: 'Frigo carni' }, { id: 2, nome: 'Cella' }, { id: 3, nome: 'Congelatore' }],
    temperatureOggi: [{ punto_controllo_id: 2 }, { punto_controllo_id: 2 }],
    aree: [{ id: 1, nome: 'Piano', daFare: true }, { id: 2, nome: 'Cappa', daFare: false }],
    lotti: [
      { id: 1, prodotto: 'Yogurt', data_scadenza: '2026-10-06', quantita_residua: 1 },
      { id: 2, prodotto: 'Burrata', data_scadenza: '2026-10-08T00:00:00.000Z', quantita_residua: 2 },
      { id: 3, prodotto: 'Agnello', data_scadenza: '2026-10-09', quantita_residua: 3 },
      { id: 4, prodotto: 'Semola', data_scadenza: '2026-10-20', quantita_residua: 3 },
      { id: 5, prodotto: 'Finito', data_scadenza: '2026-10-08', quantita_residua: 0 },
    ],
    oggi: '2026-10-08', domani: '2026-10-09',
  });
  assert.deepEqual(passi.map((p) => p.tipo), ['temperatura', 'temperatura', 'pulizia', 'scadenze']);
  assert.deepEqual(passi.slice(0, 2).map((p) => p.punto.nome), ['Frigo carni', 'Congelatore']);
  assert.equal(passi[2].area.nome, 'Piano');
  assert.deepEqual(passi[3].lotti.map((l) => [l.prodotto, l.quando]), [['Yogurt', 'scaduto'], ['Burrata', 'oggi'], ['Agnello', 'domani']]);
  assert.deepEqual(passiGiro({ oggi: '2026-10-08', domani: '2026-10-09' }), []);
});
