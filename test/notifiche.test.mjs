import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizzaOra, prossimiPromemoria } from '../notifiche.js';

test('orario del promemoria: formati accettati', () => {
  assert.equal(normalizzaOra('9:05'), '09:05');
  assert.equal(normalizzaOra('10'), '10:00');
  assert.equal(normalizzaOra('22.30'), '22:30');
  assert.equal(normalizzaOra('25:00'), null);
  assert.equal(normalizzaOra('ciao'), null);
});

test('promemoria: uno al giorno, oggi saltato se già fatto o se l\'ora è passata', () => {
  const mattina = new Date(2026, 9, 8, 8, 0);
  const sera = new Date(2026, 9, 8, 18, 0);
  assert.equal(prossimiPromemoria('10:00', mattina, false, 14).length, 14);
  assert.equal(prossimiPromemoria('10:00', mattina, false, 14)[0].getDate(), 8);
  assert.equal(prossimiPromemoria('10:00', mattina, true, 14)[0].getDate(), 9, 'oggi già fatto: si parte da domani');
  assert.equal(prossimiPromemoria('10:00', sera, false, 14)[0].getDate(), 9, 'ora già passata: si parte da domani');
  assert.ok(prossimiPromemoria('10:00', mattina, false, 14).every((d) => d.getHours() === 10 && d.getMinutes() === 0));
});
