// Agenda della Sala e collegamento prenotazione ↔ menù (Fase 5 del controllo UX). Nomi inventati.
import test from 'node:test';
import assert from 'node:assert/strict';
import { menuPerPrenotazione, agendaGiorni, nuovoMenuDa } from '../agenda.js';

const menu = [
  { id: 'm1', data: '2026-10-25', cliente: 'Famiglia Rossì', titolo: 'Battesimo' },
  { id: 'm2', data: '2026-10-25', cliente: 'Bianchi', titolo: 'Comunione' },
  { id: 'm3', data: '2026-10-26', cliente: 'Rossi', titolo: 'Compleanno' },
  { id: 'm4', data: '2026-11-20', cliente: 'Verdi', titolo: 'Fuori agenda' },
];

test('menù della prenotazione: stesso giorno e stesso cliente, senza accenti; mai uno a caso', () => {
  assert.equal(menuPerPrenotazione(menu, { data: '2026-10-25', nome: 'Rossi' }).id, 'm1');
  assert.equal(menuPerPrenotazione(menu, { data: '2026-10-25', nome: 'bianchi' }).id, 'm2');
  assert.equal(menuPerPrenotazione(menu, { data: '2026-10-26', nome: 'Rossi Mario' }).id, 'm3');
  assert.equal(menuPerPrenotazione(menu, { data: '2026-10-25', nome: 'Neri' }), null);
  assert.equal(menuPerPrenotazione(menu, { data: '2026-10-25', nome: 'Ro' }), null, 'nome troppo corto');
  assert.equal(menuPerPrenotazione(menu, { data: '2026-10-25', nome: 'Ross' }), null, 'solo parole intere');
  const doppi = [...menu, { id: 'm5', data: '2026-10-25', cliente: 'Rossi', titolo: 'Altro' }];
  assert.equal(menuPerPrenotazione(doppi, { data: '2026-10-25', nome: 'Rossi' }), null, 'due menù possibili: nessuno');
});

test('agenda: giorni dei prossimi 14 con coperti, da confermare, menù del giorno e menù della prenotazione', () => {
  const pren = [
    { data: '2026-10-25', servizio: 'Pranzo', nome: 'Rossi', persone: 8, max: 8, daConfermare: false },
    { data: '2026-10-25', servizio: 'Pranzo', nome: 'Sardo', persone: 16, min: 13, max: 16, daConfermare: true },
    { data: '2026-10-25', servizio: 'Cena', nome: 'Neri', persone: 4, max: 4, daConfermare: false },
    { data: '2026-10-23', servizio: 'Pranzo', nome: 'Passato', persone: 4, daConfermare: false },
    { data: '2026-11-07', servizio: 'Pranzo', nome: 'Troppo avanti', persone: 4, daConfermare: false },
  ];
  const a = agendaGiorni(pren, menu, '2026-10-24');
  assert.deepEqual(a.map((g) => g.data), ['2026-10-25', '2026-10-26']);
  const [g1, g2] = a;
  assert.deepEqual(g1.servizi.map((s) => [s.servizio, s.coperti, s.daConfermare]), [['Pranzo', 24, 16], ['Cena', 4, 0]]);
  assert.deepEqual(g1.servizi[0].prenotazioni.map((p) => [p.nome, p.menu && p.menu.id]), [['Rossi', 'm1'], ['Sardo', null]]);
  assert.deepEqual(g1.menu.map((m) => m.id), ['m1', 'm2']);
  assert.deepEqual([g2.servizi.length, g2.menu.map((m) => m.id)], [0, ['m3']], 'un giorno con solo un menù compare lo stesso');
  assert.equal(agendaGiorni(pren, menu, '2026-10-24', 13).length, 2);
  assert.deepEqual(agendaGiorni([], [], '2026-10-24'), []);
});

test('menù nuovo dalla prenotazione: adulti = persone − bambini − neonati', () => {
  assert.deepEqual(nuovoMenuDa({ data: '2026-10-25', nome: ' Rossi ', persone: '12', bambini: '2', neonati: '1', tel: '333', ora: '13:00' }),
    { data: '2026-10-25', cliente: 'Rossi', adulti: 9, bambini: 2, telefono: '333', ora: '13:00' });
  assert.deepEqual(nuovoMenuDa({ data: '2026-10-25', nome: 'X', persone: '' }), { data: '2026-10-25', cliente: 'X', adulti: '', bambini: '', telefono: '', ora: '' });
});
