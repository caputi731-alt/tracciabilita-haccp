import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as tema from '../theme.js';
import { spiegaErroreBackup } from '../utile.js';

test('tema: la scelta aggiorna colori e stili sul posto e avvisa chi ridisegna', () => {
  const { COLORS, S, applicaTema, suCambioTema } = tema;
  let avvisato = null;
  suCambioTema((t) => { avvisato = t; });
  assert.equal(applicaTema('scuro', true), true);
  assert.equal(tema.TEMA_SCURO, true);
  assert.equal(COLORS.bg, '#0F1215');
  assert.equal(S.screen.backgroundColor, '#0F1215');
  assert.equal(avvisato, 'scuro');
  assert.equal(applicaTema('chiaro'), false);
  assert.equal(COLORS.bg, '#F5F6F8');
  assert.equal(S.screen.backgroundColor, '#F5F6F8');
  assert.equal(avvisato, 'scuro'); // senza `avvisa` non si ridisegna
  // scelta sconosciuta o "telefono": segue il telefono (nei test è chiaro)
  assert.equal(applicaTema('boh'), false);
  assert.equal(applicaTema('telefono'), false);
});

test('backup: messaggio comprensibile quando la cartella non è più accessibile', () => {
  const e = spiegaErroreBackup("Call to function 'ExponentFileSystem.createSAFFileAsync' has been rejected. → Caused by: java.io.IOException: Location 'content://…' isn't writable.");
  assert.equal(e.cartella, true);
  assert.match(e.testo, /Scegli di nuovo la cartella/);
  const altro = spiegaErroreBackup('Spazio esaurito');
  assert.equal(altro.cartella, false);
  assert.equal(altro.testo, 'Backup non riuscito: Spazio esaurito');
  assert.equal(spiegaErroreBackup(null), null);
});
